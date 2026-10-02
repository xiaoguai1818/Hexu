import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as support from '../../scripts/test-support.mjs';

function tree(t, files) {
  const root=mkdtempSync(join(tmpdir(),'hexu-coverage-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  for(const [path,content] of Object.entries(files)) {
    mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),content);
  }
  return root;
}
async function check(root,lcov) {
  assert.equal(typeof support.checkCoverageInventory,'function','all runtime modules need a coverage inventory guard');
  return support.checkCoverageInventory(root,lcov);
}
test('coverage inventory rejects an unimported new runtime module',async t=>{
  const root=tree(t,{'src/main.ts':'export const main=1;','src/new/module.ts':'export function missed(){return 2;}'});
  await assert.rejects(check(root,'SF:src/main.ts\nend_of_record\n'),/Coverage omitted runtime module: src\/new\/module.ts/);
});
test('coverage inventory accepts measured runtime and distinguishes erased type contracts',async t=>{
  const root=tree(t,{'src/main.ts':'export const main=1;','src/ports/member.ts':'export interface Member {id:string}\nexport type Id=string;','src/global.d.ts':'declare const probe:string;'});
  assert.deepEqual(await check(root,`SF:${root}/src/main.ts\nend_of_record\n`),['src/main.ts']);
});
test('coverage inventory includes runtime code even inside a ports directory',async t=>{
  const root=tree(t,{'src/ports/member.ts':'export class Member {value=1;}'});
  await assert.rejects(check(root,''),/Coverage omitted runtime module: src\/ports\/member.ts/);
});
test('coverage inventory rejects coverage suppression rather than hiding untested paths',async t=>{
  const root=tree(t,{'src/main.ts':'/* node:coverage ignore next */\nexport const x=1;'});
  await assert.rejects(check(root,'SF:src/main.ts\nend_of_record\n'),/Coverage suppression is not allowed/);
});
