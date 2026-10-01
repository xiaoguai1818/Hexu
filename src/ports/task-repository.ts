import type {Task} from '../core/task.ts';

export interface TaskRepository {
  get(id: string): Task | undefined;
  list(projectId: string): Task[];
  insert(task: Task): void;
  /** Atomically replace one detached aggregate iff version AND project match. */
  save(task: Task, expectedVersion: number): void;
}
