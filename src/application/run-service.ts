import {DomainError, requireText} from '../core/errors.ts';
import {normalizeResult} from '../core/result.ts';
import type {Task, Run, RunResult, RunStatus} from '../core/task.ts';
import type {TaskRepository} from '../ports/task-repository.ts';

/** Internal worker boundary. Do not expose these methods to browser identities. */
export class RunService {
  private readonly tasks: TaskRepository;
  private readonly now: () => string;
  constructor(tasks: TaskRepository, now: () => string) {this.tasks = tasks; this.now = now;}
  private load(taskId: string, runId: string): {task: Task; run: Run} {
    const stored = this.tasks.get(taskId); if (!stored) throw new DomainError('RUN_NOT_FOUND');
    const task = structuredClone(stored); const run = task.runs.find(r => r.id === runId);
    if (!run) throw new DomainError('RUN_NOT_FOUND'); return {task, run};
  }
  private persist(task: Task, run: Run, type: string): Task {
    const expected = task.version; task.version++;
    task.events.push({type, actorId: 'worker', reference: run.id, at: this.now()});
    this.tasks.save(task, expected); return structuredClone(task);
  }
  private assertStatus(run: Run, ...allowed: RunStatus[]): void {
    if (!allowed.includes(run.status)) throw new DomainError('INVALID_RUN_STATE');
  }
  start(taskId: string, runId: string): Task {
    const {task, run} = this.load(taskId, runId);
    if (run.status === 'running') return task;
    this.assertStatus(run, 'queued');
    if (task.state !== (run.kind === 'discussion' ? 'discussing' : 'queued')) throw new DomainError('INVALID_TASK_STATE');
    run.status = 'running'; run.startedAt = this.now();
    if (run.kind === 'development') task.state = 'developing';
    return this.persist(task, run, 'run.started');
  }
  finish(taskId: string, runId: string, value: RunResult): Task {
    const {task, run} = this.load(taskId, runId); const result = normalizeResult(run.kind, value);
    if (run.status === 'completed') {
      if (JSON.stringify(run.result) !== JSON.stringify(result)) throw new DomainError('RESULT_CONFLICT');
      return task;
    }
    this.assertStatus(run, 'running'); run.status = 'completed'; run.result = result; run.finishedAt = this.now();
    task.comments.push({id: `pi-${run.id}`, authorId: 'pi', authorKind: 'ai', body: result.text ?? result.summary!, at: this.now()});
    if (run.kind === 'development') task.state = 'review';
    return this.persist(task, run, 'run.completed');
  }
  fail(taskId: string, runId: string, reason: string): Task {
    const {task, run} = this.load(taskId, runId); this.assertStatus(run, 'queued', 'running');
    run.status = 'failed'; run.reason = requireText(reason, 'failure reason', 2000); run.finishedAt = this.now();
    if (run.kind === 'development') task.state = 'blocked';
    return this.persist(task, run, 'run.failed');
  }
  interrupt(taskId: string, runId: string, reason: string): Task {
    const {task, run} = this.load(taskId, runId); this.assertStatus(run, 'running', 'cancel_requested');
    run.status = 'interrupted'; run.reason = requireText(reason, 'interruption reason', 2000); run.finishedAt = this.now();
    if (run.kind === 'development') task.state = 'blocked';
    return this.persist(task, run, 'run.interrupted');
  }
  acknowledgeCancel(taskId: string, runId: string): Task {
    const {task, run} = this.load(taskId, runId); if (run.status === 'canceled') return task;
    this.assertStatus(run, 'cancel_requested'); run.status = 'canceled'; run.finishedAt = this.now();
    if (run.kind === 'development') task.state = 'canceled';
    return this.persist(task, run, 'run.canceled');
  }
}
