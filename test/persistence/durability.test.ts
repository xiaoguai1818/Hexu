import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteTasks} from '../../src/adapters/sqlite/task-repository.ts';
import {fixture,inReview} from '../support.ts';

function location(t:{after:(fn:()=>void)=>void}) {const dir=mkdtempSync(join(tmpdir(),'hexu-durable-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
test('persistence: SIGKILL rolls back an uncommitted write without losing accepted history',{timeout:30000},async t=>{
  const dir=location(t),file=join(dir,'tasks.sqlite');const db=new SqliteTasks(file);const f=fixture(db);const task=inReview(f);db.close();
  const child=fork('test/fixtures/sqlite-client.mjs',['crash',file,task.id],{execArgv:['--experimental-strip-types'],stdio:['ignore','ignore','pipe','ipc']});t.after(()=>{child.kill('SIGKILL');});
  const [ready]=await once(child,'message');assert.equal(ready.ready,true);child.send('go');const [message]=await once(child,'message');assert.equal(message.uncommitted,true);
  const exit=once(child,'exit');child.kill('SIGKILL');await exit;
  const restored=new SqliteTasks(file);assert.deepEqual(restored.get(task.id),task);restored.close();
  const raw=new DatabaseSync(file);assert.equal(raw.prepare('PRAGMA integrity_check').get()!['integrity_check'],'ok');raw.close();
});
test('persistence: stopped database backup restores all task history into a clean path',t=>{
  const dir=location(t),file=join(dir,'tasks.sqlite');const db=new SqliteTasks(file);const task=inReview(fixture(db));db.close();
  const backup=join(dir,'restored.sqlite');copyFileSync(file,backup);const restored=new SqliteTasks(backup);t.after(()=>restored.close());assert.deepEqual(restored.get(task.id),task);
});
test('persistence: reopening running state never silently restarts or completes work',t=>{
  const dir=location(t),file=join(dir,'tasks.sqlite');let db=new SqliteTasks(file);const f=fixture(db);let task=f.app.discuss('member',f.task.id,1,'clarify');task=f.worker.start(task.id,task.runs[0]!.id);db.close();
  for(let i=0;i<3;i++){db=new SqliteTasks(file);assert.deepEqual(db.get(task.id),task);db.close();}
});
test('persistence: repeated compatible startup is idempotent and does not erase data',t=>{
  const dir=location(t),file=join(dir,'tasks.sqlite');let db=new SqliteTasks(file);const task=fixture(db).task;db.close();
  for(let i=0;i<5;i++){db=new SqliteTasks(file);assert.deepEqual(db.get(task.id),task);db.close();}
});
