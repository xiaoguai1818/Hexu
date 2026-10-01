import {DomainError} from './errors.ts';
import type {Stage, StagePlan} from './stage-plan.ts';

export type TaskState = 'discussing' | 'queued' | 'developing' | 'review' | 'done' | 'blocked' | 'canceled';
export type RunStatus = 'queued' | 'running' | 'cancel_requested' | 'completed' | 'failed' | 'interrupted' | 'canceled';
export interface Comment { id: string; authorId: string; authorKind: 'human' | 'ai'; body: string; at: string }
export interface RunResult {
  text?: string;
  summary?: string;
  verification?: string;
  artifacts?: {name: string; reference: string}[];
  unresolved?: string[];
}
export interface Run {
  id: string;
  kind: Stage;
  status: RunStatus;
  requestedBy: string;
  plan: StagePlan;
  input: {title: string; comments: Comment[]; scope: string | null; priorDeliveries: RunResult[]};
  inputVersion: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  reason?: string;
  result?: RunResult;
  usage: {status: 'not_reported'};
}
export interface AuditEvent {type: string; actorId: string; at: string; reference: string}
export interface Task {
  id: string;
  projectId: string;
  title: string;
  reviewerId: string;
  state: TaskState;
  version: number;
  comments: Comment[];
  runs: Run[];
  events: AuditEvent[];
}
export function activeRun(task: Task): Run | undefined {
  return task.runs.find(r => ['queued', 'running', 'cancel_requested'].includes(r.status));
}
export function requireIdle(task: Task): void {
  if (activeRun(task)) throw new DomainError('RUN_ACTIVE');
}
export function requireState(task: Task, ...allowed: TaskState[]): void {
  if (!allowed.includes(task.state)) throw new DomainError('INVALID_TASK_STATE');
}
