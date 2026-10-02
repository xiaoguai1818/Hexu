import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTaskSnapshot} from '../../src/core/snapshot.ts';
import {fixture,inReview} from '../support.ts';
import type {Task} from '../../src/core/task.ts';

for (const state of ['queued','developing','review','done','blocked','canceled'] as const) {
  test(`snapshot lifecycle: ${state} cannot exist without supporting work`, () => {
    const task = fixture().task;
    task.state = state;
    assert.throws(() => assertTaskSnapshot(task), {code:'CORRUPT_SNAPSHOT'});
  });
}
for (const field of ['startedAt','finishedAt'] as const) {
  test(`snapshot lifecycle: completed delivery needs ${field}`, () => {
    const task = inReview(fixture()); delete task.runs[0]![field];
    assert.throws(() => assertTaskSnapshot(task), {code:'CORRUPT_SNAPSHOT'});
  });
}
test('snapshot lifecycle: incomplete work cannot carry successful delivery evidence', () => {
  const task = inReview(fixture()); task.state='blocked';
  task.runs[0]!.status='failed'; task.runs[0]!.reason='failed';
  assert.throws(() => assertTaskSnapshot(task), {code:'CORRUPT_SNAPSHOT'});
});
test('snapshot lifecycle: completed task needs a human acceptance record', () => {
  const task = inReview(fixture()); task.state='done';
  assert.throws(() => assertTaskSnapshot(task), {code:'CORRUPT_SNAPSHOT'});
});
test('snapshot lifecycle: duplicate comment identifiers are not accepted', () => {
  const task = inReview(fixture()); task.comments.push(structuredClone(task.comments[0]!));
  assert.throws(() => assertTaskSnapshot(task), {code:'CORRUPT_SNAPSHOT'});
});
test('snapshot lifecycle: legitimate failure, interruption, rework and acceptance remain readable', () => {
  for (const outcome of ['failed','interrupted','accepted','rework'] as const) {
    const f=fixture(); let task=f.app.queue('owner',f.task.id,1,{scope:'scope',environmentId:'dev'});
    const run=task.runs[0]!; task=f.worker.start(task.id,run.id);
    if(outcome==='failed') task=f.worker.fail(task.id,run.id,'tool unavailable');
    else if(outcome==='interrupted') task=f.worker.interrupt(task.id,run.id,'connection lost');
    else {
      task=f.worker.finish(task.id,run.id,{summary:'result',verification:'fixture only',artifacts:[{name:'report',reference:'fixture:report'}],unresolved:[]});
      task=f.app.review('reviewer',task.id,task.version,{body:'reviewed',intent:outcome==='accepted'?'accept':'discuss'});
      task=f.app.comment('member',task.id,task.version,'retained after review');
    }
    assertTaskSnapshot(task);
  }
});

const mutations:Record<string,(task:Task)=>void>={
  'array task state':t=>{t.state=['review'] as unknown as Task['state'];},
  'array comment author kind':t=>{t.comments[0]!.authorKind=['human'] as unknown as 'human';},
  'array run status':t=>{t.runs[0]!.status=['completed'] as unknown as 'completed';},
  'missing title':t=>{t.title='';},
  'invalid task id':t=>{t.id='../private';},
  'fractional version':t=>{t.version=1.5;},
  'malformed comment':t=>{t.comments[0]!.authorKind='unknown' as 'human';},
  'unknown run kind':t=>{t.runs[0]!.kind='unknown' as 'discussion';},
  'unknown run status':t=>{t.runs[0]!.status='unknown' as 'running';},
  'wrong skill':t=>{t.runs[0]!.plan.skills=['arbitrary'];},
  'wrong engine':t=>{t.runs[0]!.plan.engine='other' as 'pi';},
  'missing input scope':t=>{t.runs[0]!.input.scope=null;},
  'future input version':t=>{t.runs[0]!.inputVersion=t.version+1;},
  'unknown usage semantics':t=>{t.runs[0]!.usage.status='free' as 'not_reported';},
  'completed without evidence':t=>{delete t.runs[0]!.result;},
  'invalid prior result':t=>{t.runs[0]!.input.priorDeliveries=[{}];},
};
for(const [name,mutate] of Object.entries(mutations)) test(`snapshot invariant: ${name}`,()=>{
  const task=inReview(fixture());mutate(task);assert.throws(()=>assertTaskSnapshot(task),{code:'CORRUPT_SNAPSHOT'});
});
test('snapshot validation accepts all legitimately reached states',()=>{
  const f=fixture();const initial=f.task;assertTaskSnapshot(initial);
  let t=f.app.discuss('member',initial.id,1,'question');assertTaskSnapshot(t);
  t=f.worker.start(t.id,t.runs[0]!.id);assertTaskSnapshot(t);
  t=f.worker.finish(t.id,t.runs[0]!.id,{text:'confirmed requirements'});assertTaskSnapshot(t);
  t=f.app.queue('owner',t.id,t.version,{scope:'confirmed',environmentId:'dev'});assertTaskSnapshot(t);
  t=f.worker.start(t.id,t.runs[1]!.id);assertTaskSnapshot(t);
  t=f.app.requestCancel('owner',t.id,t.version);assertTaskSnapshot(t);
  t=f.worker.acknowledgeCancel(t.id,t.runs[1]!.id);assertTaskSnapshot(t);
});
