import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './support.ts';
import {DiscussionService} from '../src/application/discussion-service.ts';
import {normalizeUsage} from '../src/core/usage.ts';
import type {DiscussionRuntime,DiscussionBudget} from '../src/ports/discussion-runtime.ts';

const identity={provider:'approved',model:'test-model',version:'0.84.0'};
const usage={status:'reported' as const,inputTokens:20,outputTokens:10,cacheReadTokens:0,cacheWriteTokens:0,costStatus:'not_reported' as const};
function setup(runtime:DiscussionRuntime,maximum=2){
  const f=fixture(),reserved=new Set<string>();
  const budget:DiscussionBudget={admit(_p,key){if(reserved.size>=2)throw Object.assign(new Error(),{code:'DISCUSSION_LIMIT'});reserved.add(key);},release(key){reserved.delete(key);}};
  const service=new DiscussionService({tasks:f.tasks,app:f.app,runs:f.worker,members:{lookup(p,u){return f.members.has(`${p}:${u}`)?{userId:u,canExecute:f.members.get(`${p}:${u}`)!}:undefined;}},runtime,budget,maxConcurrent:maximum,dailyLimit:2,timeoutMs:500,now:()=>new Date().toISOString()});
  return {...f,service,reserved};
}
const immediate:DiscussionRuntime={identity,async respond(input){assert.equal(input.scope,null);return {text:'需求已澄清，但尚未授权开发',usage};}};
test('discussion: same task receives a real runtime result and measured tokens without entering development',async()=>{
  const f=setup(immediate);const task=f.service.request('member',f.task.id,1,'先澄清目标');await f.service.idle();
  const result=f.app.get('owner',task.id);assert.equal(result.state,'discussing');assert.equal(result.comments.length,2);assert.equal(result.runs[0]!.status,'completed');assert.deepEqual(result.runs[0]!.usage,usage);assert.deepEqual(result.runs[0]!.model,identity);
  f.service.request('member',task.id,result.version,'继续澄清');await f.service.idle();assert.equal(f.app.get('owner',task.id).runs.length,2);
});
test('discussion: authorization, stale requests and failed admission never make hidden runs',async()=>{
  const f=setup(immediate);assert.throws(()=>f.service.request('outsider',f.task.id,1,'hello'),{code:'FORBIDDEN'});assert.throws(()=>f.service.request('member',f.task.id,0,'hello'),{code:'CONFLICT'});assert.equal(f.reserved.size,0);
  f.service.request('member',f.task.id,1,'hello');assert.throws(()=>f.service.request('member',f.task.id,1,'retry'),{code:'CONFLICT'});await f.service.idle();assert.equal(f.app.get('owner',f.task.id).runs.length,1);
  let t=f.app.get('owner',f.task.id);f.service.request('member',t.id,t.version,'second');await f.service.idle();t=f.app.get('owner',t.id);assert.throws(()=>f.service.request('member',t.id,t.version,'third'),{code:'DISCUSSION_LIMIT'});assert.deepEqual(f.app.get('owner',t.id),t);
});
test('discussion: comments during a reply are retained without silently changing its input',async()=>{
  let release!:(value:{text:string;usage:typeof usage})=>void;let captured:unknown;
  const f=setup({identity,respond(input){captured=structuredClone(input);return new Promise(r=>release=r);}});
  const t=f.service.request('member',f.task.id,1,'first');f.app.comment('owner',t.id,f.app.get('owner',t.id).version,'later');
  release({text:'response to first',usage});await f.service.idle();const next=f.app.get('owner',t.id);assert.equal(next.comments.length,3);assert.deepEqual(next.runs[0]!.input,captured);assert.equal(next.comments[1]!.body,'later');
});
test('discussion: cancellation waits for actual runtime settlement and rejects late success',async()=>{
  let release!:(v:{text:string;usage:typeof usage})=>void;
  const f=setup({identity,respond(){return new Promise(r=>release=r);}});const t=f.service.request('member',f.task.id,1,'question');
  f.app.requestCancel('owner',t.id,f.app.get('owner',t.id).version);f.service.recheck();assert.equal(f.app.get('owner',t.id).runs[0]!.status,'cancel_requested');
  release({text:'late answer',usage});await f.service.idle();const end=f.app.get('owner',t.id);assert.equal(end.runs[0]!.status,'canceled');assert.equal(end.comments.length,1);assert.deepEqual(end.runs[0]!.usage,usage);
});
test('discussion: removed member aborts their running request and does not leak upstream errors',async()=>{
  const f=setup({identity,respond(_input,signal){return new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new Error('PRIVATE KEY in upstream error')),{once:true}));}});
  const t=f.service.request('member',f.task.id,1,'question');f.members.delete('p:member');f.service.recheck();await f.service.idle();const end=f.app.get('owner',t.id);assert.equal(end.runs[0]!.status,'interrupted');assert.ok(!JSON.stringify(end).includes('PRIVATE KEY'));assert.equal(end.comments.length,1);
});
test('discussion: upstream failures and timeouts are explicit, never fabricated replies or automatic retries',async()=>{
  for(const mode of ['failure','timeout']){
    let calls=0;const f=setup({identity,respond(_input,signal){calls++;if(mode==='failure')return Promise.reject(new Error('secret'));return new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));}});
    f.service.request('member',f.task.id,1,'question');await f.service.idle();const end=f.app.get('owner',f.task.id);assert.equal(calls,1);assert.equal(end.runs[0]!.status,mode==='failure'?'failed':'interrupted');assert.deepEqual(end.runs[0]!.usage,{status:'not_reported'});assert.equal(end.comments.length,1);
  }
});
test('discussion: concurrency admission and shutdown do not abandon silently running jobs',async()=>{
  const f=setup({identity,respond(_input,signal){return new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true}));}},1);
  f.service.request('member',f.task.id,1,'question');const second=f.app.create({actorId:'owner',projectId:'p',title:'another',reviewerId:'reviewer'});assert.throws(()=>f.service.request('member',second.id,1,'q'),{code:'DISCUSSION_BUSY'});
  await f.service.shutdown();assert.equal(f.app.get('owner',f.task.id).runs[0]!.status,'interrupted');assert.throws(()=>f.service.request('member',second.id,1,'q'),{code:'PI_NOT_READY'});
});
test('discussion: orphaned requests are interrupted on exclusive startup, never replayed',()=>{
  const f=setup(immediate);let t=f.app.discuss('member',f.task.id,1,'pending');f.service.recover([t]);assert.equal(f.app.get('owner',t.id).runs[0]!.status,'failed');
  t=f.app.discuss('member',t.id,f.app.get('owner',t.id).version,'running');t=f.worker.start(t.id,t.runs.at(-1)!.id);f.service.recover([t]);assert.equal(f.app.get('owner',t.id).runs.at(-1)!.status,'interrupted');assert.equal(f.service.activeCount,0);
});
test('usage: measured values are strict and unknown fees never become zero',()=>{
  assert.deepEqual(normalizeUsage(usage),usage);assert.deepEqual(normalizeUsage({status:'not_reported'}),{status:'not_reported'});
  for(const value of [null,{}, {status:'free'},{...usage,inputTokens:-1},{...usage,outputTokens:1.5},{...usage,cacheReadTokens:Infinity},{...usage,costStatus:'free'},{...usage,extra:'secret'}])assert.throws(()=>normalizeUsage(value),{code:'INVALID_INPUT'});
});
test('usage: repeated reports are idempotent and conflicting reports cannot overwrite evidence',()=>{
  const f=fixture();let t=f.app.discuss('member',f.task.id,1,'question');const id=t.runs[0]!.id;
  assert.throws(()=>f.worker.reportUsage(t.id,id,usage),{code:'INVALID_RUN_STATE'});f.worker.start(t.id,id);t=f.worker.reportUsage(t.id,id,usage);assert.deepEqual(f.worker.reportUsage(t.id,id,usage),t);assert.throws(()=>f.worker.reportUsage(t.id,id,{...usage,outputTokens:30}),{code:'USAGE_CONFLICT'});
});
