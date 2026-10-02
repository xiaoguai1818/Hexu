import test from 'node:test';
import assert from 'node:assert/strict';
import {retrySqliteStartup} from '../src/adapters/sqlite/startup.ts';
test('startup lock handling retries only SQLITE_BUSY and returns the completed observation',()=>{
  let calls=0;assert.equal(retrySqliteStartup(()=>{if(calls++<2)throw Object.assign(new Error('busy'),{code:'ERR_SQLITE_ERROR',errcode:5});return 'ready';},100),'ready');assert.equal(calls,3);
});
test('startup retries are bounded and never swallow corruption, readonly or unknown errors',()=>{
  for(const error of [new Error('database is locked'),{code:'ERR_SQLITE_ERROR',errcode:8},{code:'ERR_SQLITE_ERROR',errcode:11},{code:'ERR_SQLITE_ERROR',errcode:5}]){let calls=0;assert.throws(()=>retrySqliteStartup(()=>{calls++;throw error;},0));assert.equal(calls,1);}
});
