import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {normalizeResult} from '../src/core/result.ts';
import type {Stage} from '../src/core/stage-plan.ts';
import type {RunResult, Task} from '../src/core/task.ts';
import {SqliteTasks} from '../src/adapters/sqlite/task-repository.ts';
import {fixture, delivery, inReview} from './support.ts';

// Every regression asserts observable behavior, not the presence of source text.
test('REG-001: unknown result stage cannot be treated as development', () => {
  assert.throws(() => normalizeResult('unexpected' as Stage, delivery), {code:'INVALID_INPUT'});
});

test('REG-002: a future database is rejected without modifying its format', t => {
  const dir=mkdtempSync(join(tmpdir(),'hexu-future-')); t.after(() => rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'tasks.sqlite'); const future=new DatabaseSync(file);
  future.exec('CREATE TABLE future_marker (value TEXT); INSERT INTO future_marker VALUES (\'keep\'); PRAGMA user_version=99;'); future.close();
  const before=readFileSync(file);
  assert.throws(() => new SqliteTasks(file),{code:'SCHEMA_TOO_NEW'});
  assert.deepEqual(readFileSync(file),before,'rejected startup must not rewrite the future database');
  const inspect=new DatabaseSync(file); t.after(() => inspect.close());
  assert.equal(inspect.prepare('PRAGMA journal_mode').get()!['journal_mode'],'delete');
  assert.equal(inspect.prepare('SELECT value FROM future_marker').get()!['value'],'keep');
});

for (const [name, corrupt] of [
  ['null', () => null],
  ['comments shape', (v:Task) => ({...v,comments:null})],
  ['unknown state', (v:Task) => ({...v,state:'apparently-finished'})],
  ['missing reviewer', (v:Task) => ({...v,reviewerId:null})],
  ['invalid event', (v:Task) => ({...v,events:[null]})],
  ['version mismatch', (v:Task) => ({...v,version:v.version+1})],
] as const) {
  test(`REG-003: corrupt snapshot (${name}) fails explicitly, never resets data`, t => {
    const dir=mkdtempSync(join(tmpdir(),'hexu-corrupt-')); t.after(() => rmSync(dir,{recursive:true,force:true}));
    const file=join(dir,'tasks.sqlite'); const db=new SqliteTasks(file); const f=fixture(db);
    const raw=new DatabaseSync(file); t.after(() => {raw.close();db.close();});
    const snapshot=JSON.stringify(corrupt(f.task)); raw.prepare('UPDATE tasks SET snapshot=? WHERE id=?').run(snapshot,f.task.id);
    assert.throws(() => db.get(f.task.id),{code:'CORRUPT_SNAPSHOT'});
    assert.throws(() => db.list('p'),{code:'CORRUPT_SNAPSHOT'});
    assert.equal(raw.prepare('SELECT snapshot FROM tasks WHERE id=?').get(f.task.id)!['snapshot'],snapshot);
  });
}

test('REG-004: persisted discussion cannot contain a privileged development plan', t => {
  const dir=mkdtempSync(join(tmpdir(),'hexu-plan-')); t.after(() => rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'tasks.sqlite'); const db=new SqliteTasks(file); const f=fixture(db);
  const task=f.app.discuss('member',f.task.id,1,'clarify'); const raw=new DatabaseSync(file);
  t.after(() => {raw.close();db.close();});
  task.runs[0]!.plan.capabilities.push('edit_project');
  raw.prepare('UPDATE tasks SET snapshot=? WHERE id=?').run(JSON.stringify(task),task.id);
  assert.throws(() => db.get(task.id),{code:'CORRUPT_SNAPSHOT'});
});

test('REG-005: failed input validation leaves the whole persisted task unchanged', t => {
  const db=new SqliteTasks(':memory:'); t.after(() => db.close()); const f=fixture(db);
  const before=JSON.stringify(db.get(f.task.id));
  for (const body of ['', ' ', null, false, 12, {}, [], 'x'.repeat(10_001)]) {
    assert.throws(() => f.app.comment('member',f.task.id,1,body as string),{code:'INVALID_INPUT'});
    assert.equal(JSON.stringify(db.get(f.task.id)),before);
  }
});

test('REG-006: malformed completion cannot lose a running task or create an AI comment', () => {
  const f=fixture(); let task=f.app.queue('owner',f.task.id,1,{scope:'parser only',environmentId:'dev'});
  task=f.worker.start(task.id,task.runs[0]!.id); const before=JSON.stringify(task);
  const values=[null,[],{}, {...delivery,summary:''},{...delivery,artifacts:[]},{...delivery,unresolved:[null]}, {...delivery,artifacts:[null]}, {...delivery,accepted:true}];
  for (const v of values) {
    assert.throws(() => f.worker.finish(task.id,task.runs[0]!.id,v as RunResult),{code:'INVALID_INPUT'});
    assert.equal(JSON.stringify(f.app.get('owner',task.id)),before);
  }
});

test('REG-007: a failed save is observable and leaves no ghost comment or authorization', () => {
  const f=fixture(); const before=JSON.stringify(f.task);
  f.tasks.save=() => {throw new Error('simulated storage unavailable');};
  assert.throws(() => f.app.comment('member',f.task.id,1,'must not appear'),/storage unavailable/);
  assert.throws(() => f.app.queue('owner',f.task.id,1,{scope:'must not start',environmentId:'dev'}),/storage unavailable/);
  assert.equal(JSON.stringify(f.tasks.get(f.task.id)),before);
});

test('REG-008: second development receives prior delivery and newly confirmed scope, not future comments', () => {
  const f=fixture(); let task=inReview(f);
  task=f.app.review('reviewer',task.id,task.version,{body:'review new requirement',intent:'discuss'});
  task=f.app.queue('owner',task.id,task.version,{scope:'second confirmed scope',environmentId:'dev'});
  const input=structuredClone(task.runs[1]!.input);
  task=f.app.comment('member',task.id,task.version,'unconfirmed third idea');
  assert.deepEqual(task.runs[1]!.input,input); assert.deepEqual(input.priorDeliveries,[delivery]);
  assert.equal(input.scope,'second confirmed scope');
  input.comments[0]!.body='external mutation';
  assert.notEqual(f.app.get('owner',task.id).runs[1]!.input.comments[0]!.body,'external mutation');
});

test('REG-009: revoked execute permission blocks queue and cancellation without losing comments', () => {
  const f=fixture(); f.members.set('p:owner',false);
  assert.throws(() => f.app.queue('owner',f.task.id,1,{scope:'no',environmentId:'dev'}),{code:'EXECUTION_FORBIDDEN'});
  assert.equal(f.app.comment('owner',f.task.id,1,'still collaborating').comments.length,1);
});

test('REG-010: project isolation applies even to identical task titles and shared members', t => {
  const db=new SqliteTasks(':memory:'); t.after(() => db.close()); const f=fixture(db);
  f.members.set('other:owner',true); f.members.set('other:reviewer',false);
  const other=f.app.create({actorId:'owner',projectId:'other',title:f.task.title,reviewerId:'reviewer'});
  assert.equal(f.app.list('member','p').length,1);
  assert.throws(() => f.app.get('member',other.id),{code:'FORBIDDEN'});
  assert.throws(() => f.app.comment('member',other.id,1,'cross-project'),{code:'FORBIDDEN'});
  assert.equal(db.get(other.id)!.comments.length,0);
});
