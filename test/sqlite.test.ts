import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteTasks} from '../src/adapters/sqlite/task-repository.ts';
import {fixture,inReview,delivery} from './support.ts';

test('persistent repository runs the discussion/development/review workflow', t => {
  const db=new SqliteTasks(':memory:'); t.after(() => db.close()); const f=fixture(db); const result=inReview(f);
  assert.equal(db.get(result.id)?.state,'review'); assert.equal(db.get(result.id)?.runs[0]?.result?.summary,delivery.summary);
});
test('database reopen preserves comments, approvals and queued work without starting it', t => {
  const dir=mkdtempSync(join(tmpdir(),'hexu-')); const file=join(dir,'test.sqlite'); t.after(() => rmSync(dir,{recursive:true,force:true}));
  let db=new SqliteTasks(file); const f=fixture(db); let task=f.app.comment('member',f.task.id,1,'应保留');
  task=f.app.queue('owner',task.id,task.version,{scope:'只改解析器',environmentId:'dev'}); db.close();
  db=new SqliteTasks(file); t.after(() => db.close());
  const stored=db.get(task.id)!; assert.equal(stored.state,'queued'); assert.equal(stored.comments[0]?.body,'应保留'); assert.equal(stored.runs[0]?.input.scope,'只改解析器');
});
test('two database connections reject lost updates', t => {
  const dir=mkdtempSync(join(tmpdir(),'hexu-cas-')); const file=join(dir,'test.sqlite'); const a=new SqliteTasks(file); const b=new SqliteTasks(file);
  t.after(() => {a.close();b.close();rmSync(dir,{recursive:true,force:true});});
  const f=fixture(a); const stale=b.get(f.task.id)!; f.app.comment('member',f.task.id,1,'new');
  stale.version=2; assert.throws(() => b.save(stale,1),{code:'CONFLICT'}); assert.equal(a.get(f.task.id)?.comments.length,1);
});
test('repository cannot silently move task into another project or duplicate ids', t => {
  const db=new SqliteTasks(':memory:'); t.after(() => db.close()); const {task}=fixture(db);
  assert.throws(() => db.insert(task),{code:'CONFLICT'});
  const next={...task,version:2,projectId:'other'}; assert.throws(() => db.save(next,1),{code:'CONFLICT'});
  assert.equal(db.list('other').length,0);
});
