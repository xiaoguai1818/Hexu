import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createPiRuntime} from '../../runners/pi/bridge.mjs';
import {modelServer} from '../fixtures/model-server.mjs';
const skill=readFileSync('skills/requirements/SKILL.md','utf8');
async function fixture(t){
  const {server,requests}=modelServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  const config={model:'hexu-test-model',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,apiKey:'synthetic-test-key',maxOutputTokens:128,maxInputChars:32000,timeoutMs:5000};
  const runtime=createPiRuntime(config,skill);
  return {runtime,requests,config};
}
const input=(text)=>({title:'任务需求',comments:[{id:'c1',authorId:'member',authorKind:'human',body:text,at:'2026-10-05T12:00:00Z'}],scope:null,priorDeliveries:[]});
test('real Pi: pinned SDK, requirements skill, exact model and no tools reach the approved endpoint',async t=>{
  const f=await fixture(t);assert.equal(JSON.parse(readFileSync('runners/pi/node_modules/@earendil-works/pi-coding-agent/package.json')).version,'1.0.3');
  const result=await f.runtime.respond(input('想法未成熟'),new AbortController().signal);assert.match(result.text,/测试模型答复/);assert.equal(result.usage.status,'reported');assert.equal(result.usage.inputTokens,40);assert.equal(result.usage.outputTokens,20);assert.equal(result.usage.costStatus,'not_reported');
  assert.equal(f.requests.length,1);const wire=f.requests[0];assert.equal(wire.model,'hexu-test-model');assert.equal(wire.tools?.length??0,0);assert.equal(wire.max_tokens??wire.max_completion_tokens,128);assert.match(JSON.stringify(wire.messages),/需求分析师/);assert.match(JSON.stringify(wire.messages),/想法未成熟/);
});
test('real Pi: subsequent input contains previous discussion while separate tasks remain isolated',async t=>{
  const f=await fixture(t);const first=await f.runtime.respond(input('PROJECT_A_ONLY'),new AbortController().signal);
  const next=input('PROJECT_A_ONLY');next.comments.push({id:'c2',authorId:'pi',authorKind:'ai',body:first.text,at:'2026-10-05T12:00:01Z'});await f.runtime.respond(next,new AbortController().signal);
  await f.runtime.respond(input('PROJECT_B_ONLY'),new AbortController().signal);
  assert.match(JSON.stringify(f.requests[1]),/测试模型答复/);assert.ok(!JSON.stringify(f.requests[2]).includes('PROJECT_A_ONLY'));
});
test('real Pi: absent usage is unknown, never counted as a free model call',async t=>{
  const f=await fixture(t);const r=await f.runtime.respond(input('[MISSING_USAGE]'),new AbortController().signal);assert.deepEqual(r.usage,{status:'not_reported'});
});
test('real Pi: provider failures and truncated replies do not produce successful discussion results',async t=>{
  const f=await fixture(t);for(const tag of ['[FAIL]','[LENGTH]'])await assert.rejects(f.runtime.respond(input(tag),new AbortController().signal));assert.equal(f.requests.length,2);
});
test('real Pi: attempted tool call cannot modify a file or trigger a second model turn',async t=>{
  const f=await fixture(t);await assert.rejects(f.runtime.respond(input('[TOOL]'),new AbortController().signal));assert.equal(f.requests.length,1);assert.equal(existsSync('unauthorized.txt'),false);
});
test('real Pi: abort terminates an actual pending provider request',async t=>{
  const f=await fixture(t),controller=new AbortController();const pending=f.runtime.respond(input('[SLOW]'),controller.signal);const assertion=assert.rejects(pending);
  for(let i=0;f.requests.length===0&&i<100;i++)await delay(20);assert.equal(f.requests.length,1);controller.abort();await assertion;
  await assert.rejects(f.runtime.respond(input('pre-aborted'),controller.signal));assert.equal(f.requests.length,1);
});
test('real Pi: task text cannot load local extensions or become a slash command',async t=>{
  const f=await fixture(t),root=mkdtempSync(join(tmpdir(),'hexu-untrusted-')),old=process.cwd();t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'.pi/extensions'),{recursive:true});writeFileSync(join(root,'.pi/extensions/evil.ts'),`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(join(root,'executed'))},'bad');`);process.chdir(root);
  try{await f.runtime.respond(input('/reload !touch unauthorized.txt'),new AbortController().signal);assert.equal(existsSync(join(root,'executed')),false);assert.equal(existsSync(join(root,'unauthorized.txt')),false);}finally{process.chdir(old);}
});
test('real Pi: excessive context and development scope are rejected before any request',async t=>{
  const f=await fixture(t);await assert.rejects(f.runtime.respond(input('x'.repeat(33000)),new AbortController().signal));await assert.rejects(f.runtime.respond({...input('develop'),scope:'write code'},new AbortController().signal));assert.equal(f.requests.length,0);
});
