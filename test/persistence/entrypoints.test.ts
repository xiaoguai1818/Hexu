import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SqliteWorkspace} from '../../src/adapters/sqlite/workspace.ts';

test('runtime entry: operator provisions accounts using stdin without exposing passwords',t=>{
  const dir=mkdtempSync(join(tmpdir(),'hexu-cli-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const secret='Synthetic operator test password';const env={...process.env,HEXU_DATA_DIR:dir};
  const run=(input:string)=>spawnSync(process.execPath,['bin/add-user.mjs'],{input,env,encoding:'utf8',timeout:15000});
  const first=run(JSON.stringify({username:'cli-user',password:secret}));assert.equal(first.status,0,first.stderr);assert.ok(!first.stdout.includes(secret));assert.ok(!first.stderr.includes(secret));
  const store=new SqliteWorkspace(join(dir,'workspace.sqlite'));assert.ok(store.accountByName('cli-user'));store.close();
  const duplicate=run(JSON.stringify({username:'cli-user',password:secret}));assert.equal(duplicate.status,1);assert.ok(!duplicate.stderr.includes(secret));
  const invalid=run('not-json-'+secret);assert.equal(invalid.status,1);assert.ok(!invalid.stderr.includes(secret));
});
test('runtime entry: missing deployment origin fails rather than starting an insecure service',t=>{
  const dir=mkdtempSync(join(tmpdir(),'hexu-start-config-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const result=spawnSync(process.execPath,['bin/server.mjs'],{env:{...process.env,HEXU_DATA_DIR:join(dir,'data'),HEXU_PUBLIC_ORIGIN:'',HEXU_ALLOW_INSECURE_HTTP:''},encoding:'utf8',timeout:10000});
  assert.equal(result.status,1);assert.equal(existsSync(join(dir,'data')),false);
});
