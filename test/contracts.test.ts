import test from 'node:test';
import assert from 'node:assert/strict';
import {stagePlan} from '../src/core/stage-plan.ts';
import type {Stage} from '../src/core/stage-plan.ts';
import {fixture} from './support.ts';

test('unknown Pi stage is rejected instead of granting development capabilities', () => {
  assert.throws(() => stagePlan('unexpected' as Stage,'dev'),{code:'INVALID_INPUT'});
});
test('every human mutation requires a valid expected version', () => {
  const {app,task}=fixture();
  for (const v of [undefined,0,-1,NaN,1.5]) {
    const version=v as number;
    assert.throws(() => app.comment('owner',task.id,version,'test'),{code:'CONFLICT'});
    assert.throws(() => app.discuss('owner',task.id,version,'test'),{code:'CONFLICT'});
    assert.throws(() => app.queue('owner',task.id,version,{scope:'test',environmentId:'dev'}),{code:'CONFLICT'});
    assert.throws(() => app.requestCancel('owner',task.id,version),{code:'CONFLICT'});
    assert.throws(() => app.review('owner',task.id,version,{body:'accept',intent:'accept'}),{code:'CONFLICT'});
  }
  assert.equal(app.get('owner',task.id).version,1);
});
test('discussion output cannot smuggle delivery or status fields into the task', () => {
  const {app,worker,task}=fixture(); let t=app.discuss('member',task.id,1,'clarify');const r=t.runs[0]!;
  t=worker.start(t.id,r.id);
  assert.throws(() => worker.finish(t.id,r.id,{text:'done',summary:'pretend delivery'}),{code:'INVALID_INPUT'});
  assert.equal(app.get('owner',t.id).runs[0]?.status,'running');
});
test('discussion and development select different skills but the same engine', () => {
  const a=stagePlan('discussion'), b=stagePlan('development','dev');
  assert.equal(a.engine,b.engine);assert.notDeepEqual(a.skills,b.skills);assert.deepEqual(a.capabilities,['conversation']);
});
