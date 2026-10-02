import test from 'node:test';
import assert from 'node:assert/strict';
import {checkBrowserReport} from '../../scripts/browser-report.mjs';
const good=()=>({stats:{expected:9,unexpected:0,flaky:0,skipped:0},errors:[]});
test('browser quality gate accepts nonempty fully passing cases',()=>assert.equal(checkBrowserReport(good(),9).expected,9));
test('browser quality gate fails on skipped, flaky, failed, missing and undersized reports',()=>{
  for(const value of [undefined,{}, {...good(),stats:{...good().stats,expected:0}},{...good(),errors:['runner failure']}])assert.throws(()=>checkBrowserReport(value,9));
  for(const key of ['unexpected','flaky','skipped'])assert.throws(()=>checkBrowserReport({...good(),stats:{...good().stats,[key]:1}},9));
});
