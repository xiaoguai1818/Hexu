import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {request,create,action,worker} from './client.mjs';
const phase=process.argv[2],file=(process.env.HEXU_REPORT_DIR??'/reports')+'/expected-task.json';
if(phase==='prepare') {
  let task=await create('Crash/recreate/restore acceptance fixture');task=await action(task,'discuss',{body:'Must survive process loss'},'member');task=await worker(task,'start');
  writeFileSync(file,JSON.stringify(task));console.log('lifecycle: stored a running discussion; no real Pi process is claimed');
} else if(phase==='verify') {
  const expected=JSON.parse(readFileSync(file,'utf8'));const {data}=await request(`/tasks/${expected.id}`);assert.deepEqual(data,expected);assert.equal(data.runs.length,1);assert.equal(data.runs[0].status,'running');
  assert.equal((await request('/__fixture/integrity',{actor:'worker'})).data.integrity,'ok');console.log('lifecycle: exact persisted state restored, no silent replay/completion');
} else throw new Error('Unknown lifecycle phase');
