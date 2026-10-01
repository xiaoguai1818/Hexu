import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import type {ChildProcess} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteTasks} from '../../src/adapters/sqlite/task-repository.ts';
import {fixture} from '../support.ts';

type Reply={ready?:boolean;ok?:boolean;code?:string;message?:string};
async function contenders(mode:string,file:string,id='') {
  const children:ChildProcess[]=[];
  try {
    const waiters=Array.from({length:8},()=>{
      const child=fork('test/fixtures/sqlite-client.mjs',[mode,file,id],{execArgv:['--experimental-strip-types'],stdio:['ignore','ignore','pipe','ipc']});children.push(child);
      let readyResolve:()=>void=()=>{},resultResolve:(r:Reply)=>void=()=>{};const ready=new Promise<void>(r=>readyResolve=r), result=new Promise<Reply>(r=>resultResolve=r);
      child.on('message',(m:Reply)=>{if(m.ready)readyResolve();else resultResolve(m);});
      child.on('exit',(code)=>{readyResolve();if(code!==0)resultResolve({ok:false,message:`child exited ${code}`});});
      return {child,ready,result};
    });
    await Promise.all(waiters.map(x=>x.ready));for(const x of waiters) {assert.ok(x.child.connected,'child must be ready');x.child.send('go');}
    return await Promise.all(waiters.map(x=>x.result));
  } finally {for(const child of children)child.kill();}
}
test('persistence: eight independent processes initialize one empty database safely', {timeout:60000},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'hexu-start-race-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  for(let round=0;round<3;round++) {const results=await contenders('start',join(dir,`${round}.sqlite`));assert.ok(results.every(r=>r.ok),JSON.stringify(results));}
});
test('persistence: eight competing processes produce exactly one versioned write', {timeout:60000},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'hexu-write-race-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'tasks.sqlite');
  const db=new SqliteTasks(file);const f=fixture(db);const id=f.task.id;db.close();
  const results=await contenders('cas',file,id);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.code==='CONFLICT').length,7);
  const check=new SqliteTasks(file);t.after(()=>check.close());assert.equal(check.get(id)!.version,2);
});
