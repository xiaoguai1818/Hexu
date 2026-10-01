import test from 'node:test';
import assert from 'node:assert/strict';
import {request,create,action,worker,delivery,base,peer} from './client.mjs';

test('deployment: ready server uses compiled artifact and current source identity',async()=>{
  const {data}=await request('/health');assert.equal(data.kind,'hexu-core-ci-fixture');assert.equal(data.ready,true);assert.equal(data.source,process.env.HEXU_SOURCE_SHA);assert.equal(data.runtimeSource,'dist');
});
test('deployment: multi-person discussion, authorization, delivery and acceptance through real HTTP',async()=>{
  let task=await create();task=await action(task,'discuss',{body:'Clarify parser requirements'},'member');
  assert.equal(task.state,'discussing');assert.deepEqual(task.runs[0].plan.capabilities,['conversation']);
  task=await worker(task,'start');task=await worker(task,'finish',{result:{text:'Confirmed: parse logs, do not write to devices'}});
  task=await action(task,'queue',{scope:'Parse logs only',environmentId:'ci-shared'});assert.equal(task.state,'queued');
  assert.equal(task.runs[1].plan.engine,task.runs[0].plan.engine);assert.equal(task.runs[1].plan.role,'developer-architect');
  assert.match(task.runs[1].input.comments.at(-1).body,/Confirmed/);
  task=await worker(task,'start');const original=structuredClone(task.runs[1].input);
  task=await action(task,'comment',{body:'Later consider another format'},'member');assert.deepEqual(task.runs[1].input,original);
  task=await worker(task,'finish',{result:delivery});assert.equal(task.state,'review');assert.equal(task.runs[1].usage.status,'not_reported');
  task=await action(task,'review',{body:'Reviewed and accepted',intent:'accept'},'reviewer');assert.equal(task.state,'done');
  task=await action(task,'comment',{body:'已完成；new idea for next time'},'member');assert.equal(task.state,'done');assert.equal(task.runs.length,2);
});
test('deployment: project visibility and comment rights do not grant execution or worker rights',async()=>{
  const task=await create();await request(`/tasks/${task.id}`,{actor:'member'});
  for(const actor of ['outsider','platform-admin']) await request(`/tasks/${task.id}`,{actor,expected:403});
  await request(`/tasks/${task.id}/queue`,{actor:'member',body:{version:task.version,scope:'unauthorized',environmentId:'dev'},expected:403});
  await request('/__fixture/worker',{actor:'member',body:{action:'start',taskId:task.id,runId:'fake'},expected:403});
  await request(`/tasks/${task.id}`,{actor:'invalid',expected:401});
});
test('deployment: concurrent authorization across two processes creates only one run',async()=>{
  const task=await create();const results=await Promise.all(Array.from({length:12},(_,i)=>request(`/tasks/${task.id}/queue`,{url:i%2?peer:base,body:{version:task.version,scope:'one confirmed scope',environmentId:'dev'},expected:null})));
  assert.equal(results.filter(x=>x.status===200).length,1);assert.equal(results.filter(x=>x.status===409).length,11);
  const stored=(await request(`/tasks/${task.id}`)).data;assert.equal(stored.runs.length,1);assert.equal(stored.state,'queued');
});
test('deployment: malformed completion and canceled runs cannot become accepted work',async()=>{
  let task=await create();task=await action(task,'queue',{scope:'limited scope',environmentId:'dev'});task=await worker(task,'start');
  await request('/__fixture/worker',{actor:'worker',body:{action:'finish',taskId:task.id,runId:task.runs[0].id,result:{...delivery,verification:''}},expected:400});
  task=await action(task,'cancel');assert.equal(task.runs[0].status,'cancel_requested');
  await request('/__fixture/worker',{actor:'worker',body:{action:'finish',taskId:task.id,runId:task.runs[0].id,result:delivery},expected:409});
  task=await worker(task,'acknowledgeCancel');assert.equal(task.state,'canceled');
});
test('deployment: quoted completion and ordinary comments never accept or restart work',async()=>{
  let task=await create();task=await action(task,'queue',{scope:'scope',environmentId:'dev'});task=await worker(task,'start');task=await worker(task,'finish',{result:delivery});
  for(const body of ['已完成','还没完成','他说“已完成”','帮我实现下一版']) task=await action(task,'comment',{body},'member');
  assert.equal(task.state,'review');assert.equal(task.runs.length,1);
  await request(`/tasks/${task.id}/review`,{actor:'member',body:{version:task.version,body:'已完成',intent:'accept'},expected:403});
});
test('deployment: rework preserves evidence and requires another explicit authorization',async()=>{
  let task=await create();task=await action(task,'queue',{scope:'first scope',environmentId:'dev'});task=await worker(task,'start');task=await worker(task,'finish',{result:delivery});
  task=await action(task,'review',{body:'new idea needs discussion',intent:'discuss'},'reviewer');assert.equal(task.state,'discussing');
  task=await action(task,'queue',{scope:'second scope',environmentId:'dev'});assert.equal(task.runs.length,2);assert.deepEqual(task.runs[1].input.priorDeliveries,[delivery]);
});
test('deployment: stale edits are rejected without losing another member comment',async()=>{
  const task=await create();await action(task,'comment',{body:'first comment'},'member');
  await request(`/tasks/${task.id}/comment`,{body:{version:1,body:'stale'},expected:409});
  const stored=(await request(`/tasks/${task.id}`)).data;assert.deepEqual(stored.comments.map(c=>c.body),['first comment']);
});
test('deployment: oversized discussion context fails atomically without creating a hidden run',async()=>{
  let task=await create();for(let i=0;i<22;i++)task=await action(task,'comment',{body:'x'.repeat(9900)},'member');
  const result=await request(`/tasks/${task.id}/discuss`,{actor:'member',body:{version:task.version,body:'clarify'},expected:409});assert.equal(result.data.error,'CONTEXT_TOO_LARGE');
  assert.deepEqual((await request(`/tasks/${task.id}`)).data,task);
});
test('deployment: real database stays healthy after functional and failure scenarios',async()=>{const {data}=await request('/__fixture/integrity',{actor:'worker'});assert.equal(data.integrity,'ok');});
