import { TaskService } from '../src/application/task-service.ts';
import { RunService } from '../src/application/run-service.ts';
import type { Task } from '../src/core/task.ts';
import type { TaskRepository } from '../src/ports/task-repository.ts';

export class MemoryTasks implements TaskRepository {
  rows = new Map<string, Task>();
  get(id: string) { const t = this.rows.get(id); return t ? structuredClone(t) : undefined; }
  list(projectId: string) { return [...this.rows.values()].filter(t => t.projectId === projectId).map(t => structuredClone(t)); }
  insert(task: Task) { if (this.rows.has(task.id)) throw Object.assign(new Error('duplicate'), {code:'CONFLICT'}); this.rows.set(task.id, structuredClone(task)); }
  save(task: Task, expected: number) {
    const old = this.rows.get(task.id);
    if (!old || old.version !== expected || old.projectId !== task.projectId || task.version !== expected + 1) throw Object.assign(new Error('stale'), {code:'CONFLICT'});
    this.rows.set(task.id, structuredClone(task));
  }
}

export function fixture(tasks: TaskRepository = new MemoryTasks()) {
  let next = 0;
  const members = new Map([['p:owner', true], ['p:member', false], ['p:reviewer', false]]);
  const now = () => '2026-10-01T12:00:00.000Z';
  const app = new TaskService({tasks, memberships: {lookup: (project, user) => {
    const key = `${project}:${user}`;
    return members.has(key) ? {userId:user, canExecute:members.get(key)!} : undefined;
  }}, ids: () => `id-${++next}`, now});
  const worker = new RunService(tasks, now);
  const task = app.create({actorId:'owner', projectId:'p', title:'串口日志分析', reviewerId:'reviewer'});
  return {app, worker, task, tasks, members};
}

export const delivery = {
  summary:'按确认范围完成修改',
  verification:'示例验证记录；测试替身，不是真实 Pi 或设备证据',
  artifacts:[{name:'测试报告', reference:'fixture:report'}],
  unresolved:[],
};

export function inReview(f: ReturnType<typeof fixture>) {
  let t = f.app.queue('owner', f.task.id, f.task.version, {scope:'仅分析采集日志', environmentId:'dev-pc'});
  const run = t.runs.at(-1)!;
  t = f.worker.start(t.id, run.id);
  return f.worker.finish(t.id, run.id, delivery);
}
