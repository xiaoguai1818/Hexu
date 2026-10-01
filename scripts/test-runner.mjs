import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {discoverTests,checkTap,checkInventory} from './test-support.mjs';

const root=process.cwd(), suite=process.argv[2]??'core';
const policy=JSON.parse(readFileSync(join(root,'ci/suites.json'),'utf8'));
const inventory=checkInventory(root,discoverTests(root),policy);
if(!Object.hasOwn(inventory,suite)) throw new Error(`Unknown suite: ${suite}`);
const reports=resolve(process.env.HEXU_REPORT_DIR??'ci-results'); mkdirSync(reports,{recursive:true});
writeFileSync(join(reports,'test-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
const junit=join(reports,`${suite}.junit.xml`);
const args=['--experimental-strip-types','--test','--test-timeout=90000','--test-reporter=tap','--test-reporter-destination=stdout','--test-reporter=junit',`--test-reporter-destination=${junit}`];
if(suite==='core') args.push('--experimental-test-coverage','--test-coverage-include=src/**/*.ts',`--test-coverage-lines=${policy.coverage.lines}`,`--test-coverage-branches=${policy.coverage.branches}`,`--test-coverage-functions=${policy.coverage.functions}`,'--test-reporter=lcov',`--test-reporter-destination=${join(reports,'coverage.lcov')}`);
args.push(...inventory[suite]);
const execution=spawnSync(process.execPath,args,{cwd:root,env:process.env,encoding:'utf8',timeout:240000,maxBuffer:32*1024*1024});
const output=execution.stdout??''; writeFileSync(join(reports,`${suite}.tap`),output); writeFileSync(join(reports,`${suite}.stderr.log`),execution.stderr??'');
process.stdout.write(output);process.stderr.write(execution.stderr??'');
let failure;
try {
  if(execution.error||execution.signal||execution.status!==0) throw new Error(`Test process failed: ${execution.error?.message??execution.signal??execution.status}`);
  const totals=checkTap(output,policy.suites[suite].minimum);
  if(!existsSync(junit)||!readFileSync(junit,'utf8').includes('<testcase')) throw new Error('JUnit report missing or empty');
  if(suite==='core') {
    const lcov=readFileSync(join(reports,'coverage.lcov'),'utf8');
    for(const path of ['src/core/errors.ts','src/core/result.ts','src/core/stage-plan.ts','src/core/task.ts','src/application/task-service.ts','src/application/run-service.ts','src/adapters/sqlite/task-repository.ts']) if(!lcov.includes(path)) throw new Error(`Coverage omitted runtime module: ${path}`);
  }
  writeFileSync(join(reports,`${suite}.json`),JSON.stringify({suite,scope:suite==='deployment'?'compiled-core-http-fixture-not-product-e2e':'current-core-and-test-infrastructure',source:process.env.GITHUB_SHA??process.env.HEXU_SOURCE_SHA??'local',node:process.version,files:inventory[suite],...totals,passed:true},null,2)+'\n');
} catch(error) {failure=error;writeFileSync(join(reports,`${suite}.json`),JSON.stringify({suite,passed:false,error:String(error)},null,2)+'\n');}
if(failure) {console.error(failure);process.exitCode=1;}
