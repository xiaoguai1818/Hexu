import {DatabaseSync} from 'node:sqlite';
import {retrySqliteStartup} from './startup.ts';
import {mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {DomainError} from '../../core/errors.ts';
import {assertTaskSnapshot} from '../../core/snapshot.ts';
import type {Task} from '../../core/task.ts';
import type {TaskRepository} from '../../ports/task-repository.ts';

/** One aggregate update = one atomic statement. No SQL leaks into business rules. */
export class SqliteTasks implements TaskRepository {
  private readonly db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), {recursive:true, mode:0o700});
    this.db = new DatabaseSync(filename, {timeout:5000});
    try {
      // Inspect before changing journal mode: older code must not rewrite a newer DB.
      const version = () => retrySqliteStartup(() => Number(this.db.prepare('PRAGMA user_version').get()!['user_version']));
      if (version() > 1) throw new DomainError('SCHEMA_TOO_NEW');
      if (version() === 0) {
        retrySqliteStartup(() => this.db.exec('BEGIN IMMEDIATE'));
        try {
          // Another process may have completed initialization while we waited.
          const current = version();
          if (current > 1) throw new DomainError('SCHEMA_TOO_NEW');
          if (current === 0) this.db.exec(`
            CREATE TABLE tasks (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              version INTEGER NOT NULL CHECK(version > 0),
              snapshot TEXT NOT NULL CHECK(json_valid(snapshot))
            ) STRICT;
            CREATE INDEX tasks_project ON tasks(project_id, id);
            PRAGMA user_version=1;
          `);
          this.db.exec('COMMIT');
        } catch (error) {this.db.exec('ROLLBACK'); throw error;}
      }
      retrySqliteStartup(() => this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;'));
    } catch (error) {this.db.close(); throw error;}
  }
  private decode(row: Record<string, unknown>): Task {
    let task: unknown;
    try {task = JSON.parse(String(row['snapshot']));} catch {throw new DomainError('CORRUPT_SNAPSHOT');}
    assertTaskSnapshot(task);
    if (task.id !== row['id'] || task.projectId !== row['project_id'] || task.version !== row['version']) throw new DomainError('CORRUPT_SNAPSHOT');
    return task;
  }
  get(id: string): Task | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
    return row ? this.decode(row) : undefined;
  }
  list(projectId: string): Task[] {
    return this.db.prepare('SELECT * FROM tasks WHERE project_id=? ORDER BY id').all(projectId).map(row => this.decode(row));
  }
  insert(task: Task): void {
    if (task.version !== 1) throw new DomainError('CONFLICT');
    assertTaskSnapshot(task);
    try {this.db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?)').run(task.id, task.projectId, task.version, JSON.stringify(task));}
    catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) throw new DomainError('CONFLICT');
      throw error;
    }
  }
  save(task: Task, expectedVersion: number): void {
    if (!Number.isSafeInteger(expectedVersion) || task.version !== expectedVersion + 1) throw new DomainError('CONFLICT');
    assertTaskSnapshot(task);
    const result = this.db.prepare('UPDATE tasks SET version=?, snapshot=? WHERE id=? AND project_id=? AND version=?')
      .run(task.version, JSON.stringify(task), task.id, task.projectId, expectedVersion);
    if (result.changes !== 1) throw new DomainError('CONFLICT');
  }
  close(): void {this.db.close();}
}
