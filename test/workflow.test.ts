import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, inReview, delivery} from './support.ts';

const code = (value: string) => ({code:value});

test('B02: new task is discussion-only and has no development run', () => {
  const {task} = fixture(); assert.equal(task.state,'discussing'); assert.equal(task.version,1); assert.equal(task.runs.length,0);
});
test('B03: all project members can see tasks and comment', () => {
  const {app,task} = fixture();
  assert.equal(app.list('member','p').length,1);
  const t = app.comment('member',task.id,1,'我补充设备背景'); assert.equal(t.comments[0]?.authorId,'member'); assert.equal(t.state,'discussing');
});
test('B03: outsider and unassigned platform admin get no task access', () => {
  const {app,task} = fixture();
  for (const actor of ['outsider','platform-admin']) { assert.throws(() => app.get(actor,task.id), code('FORBIDDEN')); assert.throws(() => app.list(actor,'p'),code('FORBIDDEN')); }
});
test('B03: removed member immediately loses access', () => {
  const {app,task,members} = fixture(); members.delete('p:member'); assert.throws(() => app.comment('member',task.id,1,'hi'),code('FORBIDDEN'));
});
test('B02: ordinary comments cannot authorize development or acceptance', () => {
  const {app,task} = fixture(); let t = task;
  for (const body of ['开始开发','帮我实现','已完成','还没完成']) t=app.comment('member',t.id,t.version,body);
  assert.equal(t.state,'discussing'); assert.equal(t.runs.length,0);
});
test('B06: discussion uses Pi analyst plan without a registered development host', () => {
  const {app,task,worker} = fixture(); let t=app.discuss('member',task.id,1,'请帮我梳理需求'); const r=t.runs[0]!;
  assert.equal(r.plan.engine,'pi'); assert.equal(r.plan.role,'requirements-analyst');
  assert.deepEqual(r.plan.capabilities,['conversation']); assert.equal(r.plan.target.kind,'platform');
  t=worker.start(t.id,r.id); assert.equal(t.state,'discussing');
  t=worker.finish(t.id,r.id,{text:'先明确目标与验收要求'});
  assert.equal(t.state,'discussing'); assert.equal(t.comments.at(-1)?.authorId,'pi'); assert.equal(t.runs[0]?.usage.status,'not_reported');
});
test('B02: queue requires human execute permission and confirmed scope', () => {
  const {app,task}=fixture();
  assert.throws(() => app.queue('member',task.id,1,{scope:'实现',environmentId:'dev'}),code('EXECUTION_FORBIDDEN'));
  assert.throws(() => app.queue('owner',task.id,1,{scope:' ',environmentId:'dev'}),code('INVALID_INPUT'));
  assert.throws(() => app.queue('owner',task.id,1,{scope:'实现',environmentId:''}),code('INVALID_INPUT'));
  assert.equal(app.get('owner',task.id).version,1);
});
test('B02/B06: confirmed scope and earlier discussion enter an immutable developer plan', () => {
  const {app,task,worker}=fixture(); let t=app.comment('member',task.id,1,'只读采集日志，不烧录');
  t=app.queue('owner',t.id,t.version,{scope:'实现解析器，不动设备',environmentId:'dev-pc'}); const r=t.runs.at(-1)!;
  assert.equal(t.state,'queued'); assert.equal(r.plan.engine,'pi'); assert.equal(r.plan.role,'developer-architect');
  assert.equal(r.input.comments[0]?.body,'只读采集日志，不烧录'); assert.equal(r.input.scope,'实现解析器，不动设备');
  t=app.comment('member',t.id,t.version,'下一轮再考虑烧录'); assert.equal(t.runs.at(-1)?.input.comments.length,1);
  t=worker.start(t.id,r.id); assert.equal(t.state,'developing');
});
test('one active Pi run per task, including pending discussions', () => {
  const {app,task}=fixture(); const t=app.discuss('member',task.id,1,'需求');
  assert.throws(() => app.discuss('owner',t.id,t.version,'再聊'),code('RUN_ACTIVE'));
  assert.throws(() => app.queue('owner',t.id,t.version,{scope:'实现',environmentId:'dev'}),code('RUN_ACTIVE'));
});
test('stale client mutations fail rather than overwrite newer comments', () => {
  const {app,task}=fixture(); app.comment('member',task.id,1,'先到');
  assert.throws(() => app.comment('owner',task.id,1,'迟到'),code('CONFLICT')); assert.equal(app.get('owner',task.id).comments.length,1);
});
test('Pi completion requires start and matching run identity', () => {
  const {app,task,worker}=fixture(); const t=app.queue('owner',task.id,1,{scope:'实现',environmentId:'dev'});
  assert.throws(() => worker.finish(t.id,t.runs[0]!.id,delivery),code('INVALID_RUN_STATE'));
  assert.throws(() => worker.start(t.id,'other-run'),code('RUN_NOT_FOUND'));
});
test('B09: delivery enters review, never automatic done', () => {
  const f=fixture(); const t=inReview(f);
  assert.equal(t.state,'review'); assert.deepEqual(t.runs[0]?.result,delivery); assert.equal(t.runs[0]?.usage.status,'not_reported');
});
test('B09: only designated current project reviewer can accept via explicit review intent', () => {
  const f=fixture(); const t=inReview(f);
  assert.throws(() => f.app.review('owner',t.id,t.version,{body:'已完成',intent:'accept'}),code('REVIEW_FORBIDDEN'));
  const ordinary=f.app.comment('reviewer',t.id,t.version,'还没完成'); assert.equal(ordinary.state,'review');
  const done=f.app.review('reviewer',t.id,ordinary.version,{body:'已核对并接受',intent:'accept'}); assert.equal(done.state,'done');
});
test('removed reviewer cannot accept a delivered task', () => {
  const f=fixture(); const t=inReview(f); f.members.delete('p:reviewer');
  assert.throws(() => f.app.review('reviewer',t.id,t.version,{body:'接受',intent:'accept'}),code('FORBIDDEN'));
});
test('B09: new ideas return to discussion with history, then require a new human queue action', () => {
  const f=fixture(); let t=inReview(f);
  t=f.app.review('reviewer',t.id,t.version,{body:'需要再讨论设备差异',intent:'discuss'});
  assert.equal(t.state,'discussing'); assert.equal(t.runs.length,1);
  t=f.app.queue('owner',t.id,t.version,{scope:'兼容第二种日志格式',environmentId:'dev'});
  assert.equal(t.runs.length,2); assert.equal(t.runs[0]?.status,'completed'); assert.notEqual(t.runs[0]?.id,t.runs[1]?.id);
});
test('B09: comments on completed tasks do not reopen work', () => {
  const f=fixture(); let t=inReview(f); t=f.app.review('reviewer',t.id,t.version,{body:'接受',intent:'accept'});
  t=f.app.comment('member',t.id,t.version,'另一个想法'); assert.equal(t.state,'done'); assert.equal(t.runs.length,1);
});
test('B05: queued development can be canceled without pretending a process existed', () => {
  const {app,task,worker}=fixture(); let t=app.queue('owner',task.id,1,{scope:'实现',environmentId:'dev'}); const r=t.runs[0]!;
  t=app.requestCancel('owner',t.id,t.version); assert.equal(t.state,'canceled'); assert.equal(t.runs[0]?.status,'canceled');
  assert.throws(() => worker.start(t.id,r.id),code('INVALID_RUN_STATE'));
});
test('B05: running cancel stays pending until worker acknowledgement and rejects late completion', () => {
  const {app,task,worker}=fixture(); let t=app.queue('owner',task.id,1,{scope:'实现',environmentId:'dev'}); const r=t.runs[0]!;
  t=worker.start(t.id,r.id); t=app.requestCancel('owner',t.id,t.version);
  assert.equal(t.state,'developing'); assert.equal(t.runs[0]?.status,'cancel_requested');
  assert.throws(() => worker.finish(t.id,r.id,delivery),code('INVALID_RUN_STATE'));
  t=worker.acknowledgeCancel(t.id,r.id); assert.equal(t.state,'canceled');
});
test('B05: interruption is recorded, never automatically replays a development run', () => {
  const {app,task,worker}=fixture(); let t=app.queue('owner',task.id,1,{scope:'实现',environmentId:'dev'}); const r=t.runs[0]!;
  t=worker.start(t.id,r.id); t=worker.interrupt(t.id,r.id,'worker lost');
  assert.equal(t.state,'blocked'); assert.equal(t.runs[0]?.status,'interrupted'); assert.equal(t.runs[0]?.reason,'worker lost');
  assert.throws(() => worker.start(t.id,r.id),code('INVALID_RUN_STATE'));
});
test('duplicate finish is idempotent; contradictory finish is rejected', () => {
  const f=fixture(); const t=inReview(f); const id=t.runs[0]!.id;
  assert.equal(f.worker.finish(t.id,id,delivery).version,t.version);
  assert.throws(() => f.worker.finish(t.id,id,{...delivery,summary:'contradiction'}),code('RESULT_CONFLICT'));
});
test('failure preserves a reason and does not produce an accepted deliverable', () => {
  const {app,task,worker}=fixture(); let t=app.discuss('member',task.id,1,'问题'); const r=t.runs[0]!;
  t=worker.start(t.id,r.id); t=worker.fail(t.id,r.id,'PI_NOT_CONNECTED');
  assert.equal(t.state,'discussing'); assert.equal(t.runs[0]?.status,'failed'); assert.equal(t.runs[0]?.result,undefined);
});
test('empty delivery evidence is not accepted as finished', () => {
  const {app,task,worker}=fixture(); let t=app.queue('owner',task.id,1,{scope:'实现',environmentId:'dev'}); const r=t.runs[0]!;
  t=worker.start(t.id,r.id);
  assert.throws(() => worker.finish(t.id,r.id,{...delivery,verification:' '}),code('INVALID_INPUT'));
  assert.equal(app.get('owner',t.id).state,'developing');
});
test('task return values cannot mutate saved histories', () => {
  const {app,task}=fixture(); task.title='恶意改写'; assert.equal(app.get('owner',task.id).title,'串口日志分析');
});
