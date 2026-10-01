import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {checkTap,discoverTests,checkInventory} from '../../scripts/test-support.mjs';

function tap(total=3,pass=3,fail=0,skipped=0,todo=0) {return `TAP version 13\n# tests ${total}\n# pass ${pass}\n# fail ${fail}\n# cancelled 0\n# skipped ${skipped}\n# todo ${todo}\n`;}
test('pipeline accepts only reconciled nonempty test results',()=>assert.equal(checkTap(tap(),3).passed,3));
test('pipeline rejects no tests, truncated totals, skipped cases and failures',()=>{
  for(const text of ['',tap(0,0),tap(3,2,1),tap(3,2,0,1),tap(3,2,0,0,1),tap(3,4)]) assert.throws(()=>checkTap(text,1));
});
test('pipeline discovers nested regressions and assigns suites without filename filters',t=>{
  const root=mkdtempSync(join(tmpdir(),'hexu-inventory-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  for(const file of ['test/base.test.ts','test/regression/nested/boundary.test.ts','test/persistence/race.test.ts','test/quality/config.test.mjs','test/deployment/runtime.test.mjs']) {mkdirSync(join(root,file,'..'),{recursive:true});writeFileSync(join(root,file),'');}
  const inventory=discoverTests(root);assert.equal(inventory.core.length,2);assert.equal(inventory.deployment.length,1);assert.equal(Object.values(inventory).flat().length,5);
});
test('pipeline fails when a new test directory is not assigned to any job',t=>{
  const root=mkdtempSync(join(tmpdir(),'hexu-orphan-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'test/unowned'),{recursive:true});writeFileSync(join(root,'test/unowned/new.test.ts'),'');
  assert.throws(()=>discoverTests(root),/Unassigned test/);
});
test('pipeline rejects deleted required regression files',()=>assert.throws(()=>checkInventory(process.cwd(),{core:[]},{suites:{core:{required:['test/missing.test.ts']}}}),/Empty suite/));
