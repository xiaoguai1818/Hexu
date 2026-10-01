import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTaskSnapshot} from '../../src/core/snapshot.ts';
import {fixture,inReview} from '../support.ts';
import type {Task} from '../../src/core/task.ts';

const mutations:Record<string,(task:Task)=>void>={
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
