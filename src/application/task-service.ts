import {DomainError, requireId, requireText} from '../core/errors.ts';
import {stagePlan} from '../core/stage-plan.ts';
import type {Stage} from '../core/stage-plan.ts';
import {activeRun, requireIdle, requireState} from '../core/task.ts';
import type {Task, Run} from '../core/task.ts';
import type {TaskRepository} from '../ports/task-repository.ts';
import type {Membership, MembershipDirectory} from '../ports/membership-directory.ts';

type Options = {tasks: TaskRepository; memberships: MembershipDirectory; ids: () => string; now: () => string};
export class TaskService {
  private readonly options: Options;
  constructor(options: Options) {this.options = options;}

  private member(projectId: string, actorId: string): Membership {
    const m = this.options.memberships.lookup(projectId, actorId);
    if (!m || m.userId !== actorId) throw new DomainError('FORBIDDEN');
    return m;
  }
  private execute(task: Task, actorId: string): void {
    if (this.member(task.projectId, actorId).canExecute !== true) throw new DomainError('EXECUTION_FORBIDDEN');
  }
  private load(actorId: string, id: string, version?: number): Task {
    const task = this.options.tasks.get(id);
    // Uniform access failure prevents leaking task existence to non-members.
    if (!task) throw new DomainError('FORBIDDEN');
    this.member(task.projectId, actorId);
    if (version !== undefined && (!Number.isSafeInteger(version) || task.version !== version)) throw new DomainError('CONFLICT');
    return structuredClone(task);
  }
  private edit(actorId: string, id: string, version: number): Task {
    if (!Number.isSafeInteger(version) || version < 1) throw new DomainError('CONFLICT');
    return this.load(actorId, id, version);
  }
  private persist(task: Task, actorId: string, type: string, reference = task.id): Task {
    const expected = task.version;
    task.version++;
    task.events.push({type, actorId, at: this.options.now(), reference});
    this.options.tasks.save(task, expected);
    return structuredClone(task);
  }
  private addComment(task: Task, actorId: string, body: string): void {
    task.comments.push({id: this.options.ids(), authorId: actorId, authorKind: 'human', body: requireText(body, 'comment'), at: this.options.now()});
  }
  private addRun(task: Task, actorId: string, kind: Stage, scope: string | null, environmentId?: string): void {
    const input = {
      title: task.title, comments: structuredClone(task.comments), scope,
      priorDeliveries: task.runs.filter(r => r.kind === 'development' && r.status === 'completed' && r.result).map(r => structuredClone(r.result!)),
    };
    if (JSON.stringify(input).length > 200_000) throw new DomainError('CONTEXT_TOO_LARGE', 'Explicit context curation is required; no silent truncation.');
    const run: Run = {
      id: requireId(this.options.ids(), 'run id'), kind, status: 'queued', requestedBy: actorId,
      plan: stagePlan(kind, environmentId), input, inputVersion: task.version,
      createdAt: this.options.now(), usage: {status: 'not_reported'},
    };
    task.runs.push(run);
  }

  create(input: {actorId: string; projectId: string; title: string; reviewerId: string}): Task {
    const projectId = requireId(input.projectId, 'projectId');
    this.member(projectId, input.actorId); this.member(projectId, input.reviewerId);
    const task: Task = {
      id: requireId(this.options.ids(), 'task id'), projectId,
      title: requireText(input.title, 'title', 300), reviewerId: input.reviewerId,
      state: 'discussing', version: 1, comments: [], runs: [],
      events: [{type: 'task.created', actorId: input.actorId, at: this.options.now(), reference: projectId}],
    };
    this.options.tasks.insert(task); return structuredClone(task);
  }
  get(actorId: string, id: string): Task {return this.load(actorId, id);}
  list(actorId: string, projectId: string): Task[] {
    this.member(projectId, actorId); return structuredClone(this.options.tasks.list(projectId));
  }
  comment(actorId: string, id: string, version: number, body: string): Task {
    const t = this.edit(actorId, id, version); this.addComment(t, actorId, body);
    return this.persist(t, actorId, 'comment.added', t.comments.at(-1)!.id);
  }
  discuss(actorId: string, id: string, version: number, body: string): Task {
    const t = this.edit(actorId, id, version); requireIdle(t); requireState(t, 'discussing');
    this.addComment(t, actorId, body); this.addRun(t, actorId, 'discussion', null);
    return this.persist(t, actorId, 'discussion.requested', t.runs.at(-1)!.id);
  }
  queue(actorId: string, id: string, version: number, input: {scope: string; environmentId: string}): Task {
    const t = this.edit(actorId, id, version); this.execute(t, actorId); requireIdle(t); requireState(t, 'discussing');
    const scope = requireText(input.scope, 'confirmed scope');
    this.addRun(t, actorId, 'development', scope, input.environmentId); t.state = 'queued';
    return this.persist(t, actorId, 'development.authorized', t.runs.at(-1)!.id);
  }
  review(actorId: string, id: string, version: number, input: {body: string; intent: 'accept' | 'discuss'}): Task {
    const t = this.edit(actorId, id, version); requireIdle(t); requireState(t, 'review');
    if (actorId !== t.reviewerId) throw new DomainError('REVIEW_FORBIDDEN');
    if (!['accept', 'discuss'].includes(input.intent)) throw new DomainError('INVALID_INPUT');
    // Intent is an explicit human decision, not a keyword inferred from text.
    this.addComment(t, actorId, input.body); t.state = input.intent === 'accept' ? 'done' : 'discussing';
    return this.persist(t, actorId, `review.${input.intent}`, t.comments.at(-1)!.id);
  }
  requestCancel(actorId: string, id: string, version: number): Task {
    const t = this.edit(actorId, id, version); this.execute(t, actorId);
    const run = activeRun(t); if (!run) throw new DomainError('NO_ACTIVE_RUN');
    if (run.status === 'cancel_requested') return t;
    if (run.status === 'queued') {
      run.status = 'canceled'; run.finishedAt = this.options.now();
      if (run.kind === 'development') t.state = 'canceled';
    } else run.status = 'cancel_requested';
    return this.persist(t, actorId, 'run.cancel_requested', run.id);
  }
}
