import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,copyFileSync,readFileSync,writeFileSync,existsSync,readdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDatabaseBackup} from '../../src/adapters/sqlite/backup.ts';
import {SqliteTasks} from '../../src/adapters/sqlite/task-repository.ts';
import {fixture,inReview} from '../support.ts';

function location(t:{after:(fn:()=>void)=>void}) {
  const root=mkdtempSync(join(tmpdir(),'hexu-backup-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));return root;
}
test('backup regression: preserves committed WAL records that a main-file copy loses',async t=>{
  const root=location(t),source=join(root,'source.sqlite'),target=join(root,'backup.sqlite');
  const repository=new SqliteTasks(source),raw=new DatabaseSync(source);
  try {
    raw.exec('PRAGMA wal_autocheckpoint=0; PRAGMA wal_checkpoint(TRUNCATE);');
    const task=inReview(fixture(repository));
    assert.ok(existsSync(source+'-wal'),'uncheckpointed WAL is part of this regression');
    const naive=join(root,'naive.sqlite');copyFileSync(source,naive);
    const copied=new DatabaseSync(naive,{readOnly:true});
    try {assert.equal(copied.prepare('SELECT count(*) AS n FROM tasks').get()!['n'],0);} finally {copied.close();}
    await createDatabaseBackup(source,target);
    const restored=new SqliteTasks(target);
    try {assert.deepEqual(restored.get(task.id),task);} finally {restored.close();}
  } finally {raw.close();repository.close();}
});
test('backup refuses to overwrite an existing file',async t=>{
  const root=location(t),source=join(root,'source.sqlite'),target=join(root,'keep.sqlite');
  const db=new SqliteTasks(source);fixture(db);db.close();writeFileSync(target,'keep these original bytes');
  await assert.rejects(createDatabaseBackup(source,target),{code:'BACKUP_TARGET_EXISTS'});
  assert.equal(readFileSync(target,'utf8'),'keep these original bytes');
  assert.equal(readdirSync(root).some(x=>x.startsWith('.hexu-backup-')),false);
});
test('backup refuses a symbolic-link destination without changing its target',async t=>{
  const root=location(t),source=join(root,'source.sqlite'),target=join(root,'alias.sqlite'),protectedFile=join(root,'keep.txt');
  const db=new SqliteTasks(source);db.close();writeFileSync(protectedFile,'keep');symlinkSync(protectedFile,target);
  await assert.rejects(createDatabaseBackup(source,target),{code:'BACKUP_TARGET_EXISTS'});
  assert.equal(readFileSync(protectedFile,'utf8'),'keep');
});
test('backup never overwrites its own source',async t=>{
  const root=location(t),source=join(root,'source.sqlite');const db=new SqliteTasks(source);db.close();
  const before=readFileSync(source);
  await assert.rejects(createDatabaseBackup(source,source),{code:'INVALID_INPUT'});
  assert.deepEqual(readFileSync(source),before);
});
test('backup missing source fails without creating an empty source or successful backup',async t=>{
  const root=location(t),source=join(root,'missing.sqlite'),target=join(root,'backup.sqlite');
  await assert.rejects(createDatabaseBackup(source,target));
  assert.equal(existsSync(source),false);assert.equal(existsSync(target),false);
});
test('backup corrupt source fails without publishing a partial file',async t=>{
  const root=location(t),source=join(root,'corrupt.sqlite'),target=join(root,'backup.sqlite');
  writeFileSync(source,'not a sqlite database');
  await assert.rejects(createDatabaseBackup(source,target));
  assert.equal(existsSync(target),false);assert.equal(readdirSync(root).some(x=>x.startsWith('.hexu-backup-')),false);
});
test('backup concurrent attempts publish one complete file without replacement',async t=>{
  const root=location(t),source=join(root,'source.sqlite'),target=join(root,'backup.sqlite');
  const db=new SqliteTasks(source);const task=fixture(db).task;db.close();
  const outcomes=await Promise.allSettled([createDatabaseBackup(source,target),createDatabaseBackup(source,target)]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  const rejected=outcomes.find(x=>x.status==='rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.code,'BACKUP_TARGET_EXISTS');
  const restored=new SqliteTasks(target);try {assert.deepEqual(restored.get(task.id),task);}finally{restored.close();}
});
