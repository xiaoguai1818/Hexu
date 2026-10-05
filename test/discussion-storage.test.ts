import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteDiscussionBudget} from '../src/adapters/sqlite/discussion-budget.ts';
import {readPiConfig} from '../src/adapters/pi/config.ts';
import {SqliteTasks} from '../src/adapters/sqlite/task-repository.ts';
import {fixture} from './support.ts';

function directory(t:{after:(f:()=>void)=>void}){const p=mkdtempSync(join(tmpdir(),'hexu-discussion-'));t.after(()=>rmSync(p,{recursive:true,force:true}));return p;}
test('discussion storage: exclusive owner is enforced and released without losing admission counts',t=>{
  const path=directory(t);let budget=new SqliteDiscussionBudget(path);assert.throws(()=>new SqliteDiscussionBudget(path),{code:'DISCUSSION_OWNER_ACTIVE'});
  budget.admit('p','a','2026-10-05',2);budget.admit('p','b','2026-10-05',2);assert.throws(()=>budget.admit('p','c','2026-10-05',2),{code:'DISCUSSION_LIMIT'});
  budget.close();budget=new SqliteDiscussionBudget(path);t.after(()=>budget.close());assert.throws(()=>budget.admit('p','c','2026-10-05',2),{code:'DISCUSSION_LIMIT'});
  budget.release('b');budget.admit('p','c','2026-10-05',2);budget.admit('q','d','2026-10-05',2);budget.admit('p','e','2026-10-06',2);assert.throws(()=>budget.admit('p','e','2026-10-06',2));
});
test('discussion storage: recovery only enumerates active discussion records',t=>{
  const repo=new SqliteTasks(join(directory(t),'tasks.sqlite'));t.after(()=>repo.close());const f=fixture(repo);assert.deepEqual(repo.activeDiscussions(),[]);f.app.discuss('member',f.task.id,1,'pending');assert.equal(repo.activeDiscussions().length,1);
});
test('Pi configuration: disabled by omission; keys only from a literal operator file, limits explicit',t=>{
  const root=directory(t),key=join(root,'credential'),file=join(root,'config.json');writeFileSync(key,'disposable-test-key\n');assert.equal(readPiConfig(undefined),undefined);
  const config={schema:1,model:'approved',baseUrl:'https://models.invalid/v1',apiKeyFile:key,maxConcurrent:2,dailyRequests:10,maxOutputTokens:2048,timeoutMs:60000,maxInputChars:32000};writeFileSync(file,JSON.stringify(config));assert.equal(readPiConfig(file)!.apiKey,'disposable-test-key');
  for(const change of [{schema:2},{baseUrl:'http://models.invalid/v1'},{baseUrl:'https://user:password@models.invalid'},{baseUrl:'https://models.invalid/#fragment'},{model:''},{dailyRequests:0},{maxConcurrent:20},{maxOutputTokens:0},{timeoutMs:9999999},{maxInputChars:0},{unknown:true}]){writeFileSync(file,JSON.stringify({...config,...change}));assert.throws(()=>readPiConfig(file),{code:'INVALID_PI_CONFIGURATION'});}
  writeFileSync(file,JSON.stringify({...config,baseUrl:'http://127.0.0.1:1234/v1',allowInsecureHttp:true}));assert.ok(readPiConfig(file));writeFileSync(key,'');assert.throws(()=>readPiConfig(file));
});

test('discussion storage: incompatible budget schema releases ownership without rewriting it',t=>{
  const path=directory(t),file=join(path,'discussion-budget.sqlite');let raw=new DatabaseSync(file);raw.exec('PRAGMA user_version=99');raw.close();
  assert.throws(()=>new SqliteDiscussionBudget(path),{code:'SCHEMA_TOO_NEW'});
  raw=new DatabaseSync(file);assert.equal(raw.prepare('PRAGMA user_version').get()!['user_version'],99);raw.exec('PRAGMA user_version=0');raw.close();
  const budget=new SqliteDiscussionBudget(path);budget.close();
});
