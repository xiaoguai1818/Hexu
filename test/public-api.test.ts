import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.ts';
import {fixture,inReview} from './support.ts';

test('public API exports usable workflow and persistent storage implementations', t => {
  const repository=new api.SqliteTasks(':memory:'); t.after(()=>repository.close());
  const f=fixture(repository);const task=inReview(f);
  assert.ok(f.app instanceof api.TaskService);
  assert.ok(f.worker instanceof api.RunService);
  assert.equal(repository.get(task.id)?.state,'review');
  assert.equal(api.stagePlan('discussion').engine,'pi');
  assert.equal(new api.DomainError('PROBE').code,'PROBE');
});
