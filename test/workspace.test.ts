import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SqliteWorkspace} from '../src/adapters/sqlite/workspace.ts';
import {CryptoPasswords} from '../src/adapters/auth/crypto-passwords.ts';
import {AuthService} from '../src/application/auth-service.ts';
import {WorkspaceService} from '../src/application/workspace-service.ts';
import {TaskService} from '../src/application/task-service.ts';
import {SqliteTasks} from '../src/adapters/sqlite/task-repository.ts';
import {randomUUID} from 'node:crypto';

const secret='Testing only passphrase 2026';
function setup(t:{after:(f:()=>void)=>void}) {
  const dir=mkdtempSync(join(tmpdir(),'hexu-identity-'));const store=new SqliteWorkspace(join(dir,'workspace.sqlite'));
  const tasks=new SqliteTasks(join(dir,'tasks.sqlite'));let clock=1000;
  const auth=new AuthService(store,new CryptoPasswords(),()=>clock);
  const workspace=new WorkspaceService(store,randomUUID);
  const taskService=new TaskService({tasks,memberships:store,ids:randomUUID,now:()=>new Date(clock).toISOString()});
  t.after(()=>{tasks.close();store.close();rmSync(dir,{recursive:true,force:true});});
  return {dir,store,auth,workspace,taskService,clock:(v:number)=>{clock=v;}};
}
test('real password hashing is salted, rejects mismatch and malformed records',async()=>{
  const passwords=new CryptoPasswords(),first=await passwords.hash(secret),second=await passwords.hash(secret);
  assert.notEqual(first,second);assert.ok(!first.includes(secret));assert.equal(await passwords.verify(secret,first),true);
  assert.equal(await passwords.verify('wrong',first),false);assert.equal(await passwords.verify(secret,'malformed'),false);
});
test('accounts persist; login issues opaque expiring sessions and logout revokes them',async t=>{
  const f=setup(t),user=await f.auth.provision('Alice',secret);assert.equal(user.username,'alice');
  const login=await f.auth.login('ALICE',secret,'local');assert.equal(f.auth.authenticate(login.token).user.id,user.id);
  assert.equal(f.store.session(login.token),undefined,'raw session tokens are never persisted');
  assert.throws(()=>f.auth.authenticate('invalid'),{code:'UNAUTHENTICATED'});
  f.auth.logout(login.token);assert.throws(()=>f.auth.authenticate(login.token),{code:'UNAUTHENTICATED'});
  const next=await f.auth.login('alice',secret,'local');f.clock(next.expiresAt);assert.throws(()=>f.auth.authenticate(next.token),{code:'UNAUTHENTICATED'});
  const reopened=new SqliteWorkspace(join(f.dir,'workspace.sqlite'));assert.equal(reopened.accountByName('alice')?.id,user.id);reopened.close();
});
test('invalid account inputs and duplicate accounts cannot replace credentials',async t=>{
  const {auth}=setup(t);for(const name of ['', 'a', '../alice'])await assert.rejects(auth.provision(name,secret),{code:'INVALID_INPUT'});
  await assert.rejects(auth.provision('alice','short'),{code:'INVALID_INPUT'});await auth.provision('alice',secret);
  await assert.rejects(auth.provision('ALICE',secret+'new'),{code:'ACCOUNT_EXISTS'});
  await assert.rejects(auth.login('alice','wrong','local'),{code:'UNAUTHENTICATED'});
  await assert.rejects(auth.login('unknown',secret,'local'),{code:'UNAUTHENTICATED'});
});
test('login attempts are rate limited across service instances and expire',async t=>{
  const f=setup(t);await f.auth.provision('alice',secret);
  for(let n=0;n<8;n++)await assert.rejects(f.auth.login('alice','wrong','local'),{code:'UNAUTHENTICATED'});
  await assert.rejects(f.auth.login('alice',secret,'local'),{code:'RATE_LIMITED'});
  f.clock(901001);assert.ok((await f.auth.login('alice',secret,'local')).token);
});
test('project membership is persistent, explicit and revoked on every task access',async t=>{
  const f=setup(t),owner=await f.auth.provision('owner',secret),member=await f.auth.provision('member',secret),outsider=await f.auth.provision('outsider',secret);
  const p=f.workspace.create(owner.id,'串口分析');assert.equal(f.workspace.list(owner.id).length,1);assert.equal(f.workspace.list(member.id).length,0);
  assert.throws(()=>f.workspace.get(outsider.id,p.id),{code:'FORBIDDEN'});
  f.workspace.addMember(owner.id,p.id,'member',false);
  const task=f.taskService.create({actorId:member.id,projectId:p.id,title:'梳理想法',reviewerId:owner.id});
  assert.equal(f.taskService.get(owner.id,task.id).state,'discussing');
  assert.throws(()=>f.taskService.queue(member.id,task.id,1,{scope:'change',environmentId:'pc'}),{code:'EXECUTION_FORBIDDEN'});
  assert.throws(()=>f.workspace.addMember(member.id,p.id,'outsider',true),{code:'PROJECT_OWNER_REQUIRED'});
  f.workspace.removeMember(owner.id,p.id,member.id);
  assert.throws(()=>f.taskService.get(member.id,task.id),{code:'FORBIDDEN'});
  assert.equal(f.workspace.list(member.id).length,0);
  assert.throws(()=>f.workspace.removeMember(owner.id,p.id,owner.id),{code:'OWNER_REQUIRED'});
});
test('membership mutations reject unknown accounts and malformed permission values',async t=>{
  const f=setup(t),owner=await f.auth.provision('owner',secret),member=await f.auth.provision('member',secret);const p=f.workspace.create(owner.id,'Project');
  assert.throws(()=>f.workspace.addMember(owner.id,p.id,'missing',false),{code:'ACCOUNT_NOT_FOUND'});
  assert.throws(()=>f.workspace.addMember(owner.id,p.id,'member','true' as unknown as boolean),{code:'INVALID_INPUT'});
  f.workspace.addMember(owner.id,p.id,'member',true);assert.equal(f.store.lookup(p.id,member.id)?.canExecute,true);
  f.workspace.addMember(owner.id,p.id,'member',false);assert.equal(f.store.lookup(p.id,member.id)?.canExecute,false);
  assert.throws(()=>f.workspace.addMember(owner.id,p.id,'owner',false),{code:'OWNER_REQUIRED'});
  assert.throws(()=>f.workspace.create('missing','Project'),{code:'UNAUTHENTICATED'});
});
