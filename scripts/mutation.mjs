// Targeted mutation sentinels: prove the regression suite rejects specific bad changes.
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkTap} from './test-support.mjs';
const root=process.cwd(),reports=resolve(process.env.HEXU_REPORT_DIR??'ci-results/mutation');mkdirSync(reports,{recursive:true});
const mutations=[
  {id:'member-access',file:'src/application/task-service.ts',from:"if (!m || m.userId !== actorId) throw new DomainError('FORBIDDEN');",to:"if (!m || m.userId !== actorId) return {userId:actorId,canExecute:true};"},
  {id:'execute-permission',file:'src/application/task-service.ts',from:"if (this.member(task.projectId, actorId).canExecute !== true)",to:'if (false)'},
  {id:'reviewer-permission',file:'src/application/task-service.ts',from:'if (actorId !== t.reviewerId)',to:'if (false)'},
  {id:'automatic-acceptance',file:'src/application/run-service.ts',from:"if (run.kind === 'development') task.state = 'review';",to:"if (run.kind === 'development') task.state = 'done';"},
  {id:'active-run-guard',file:'src/core/task.ts',from:'if (activeRun(task))',to:'if (false)'},
  {id:'context-loss',file:'src/application/task-service.ts',from:'comments: structuredClone(task.comments)',to:'comments: []'},
  {id:'lost-update',file:'src/adapters/sqlite/task-repository.ts',from:'WHERE id=? AND project_id=? AND version=?',to:'WHERE id=? AND project_id=? AND ? >= 0'},
  {id:'late-completion',file:'src/application/run-service.ts',from:"this.assertStatus(run, 'running'); run.status = 'completed';",to:"run.status = 'completed';"},
];
const files=['test/workflow.test.ts','test/contracts.test.ts','test/sqlite.test.ts','test/regression.test.ts'];
function run(cwd,name){
  const p=spawnSync(process.execPath,['--experimental-strip-types','--test','--test-reporter=tap',...files],{cwd,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});
  writeFileSync(join(reports,`${name}.tap`),p.stdout??'');writeFileSync(join(reports,`${name}.stderr.log`),p.stderr??'');
  if(p.error||p.signal)throw new Error(`${name}: invalid mutation observation (${p.error?.message??p.signal})`);
  return p;
}
const baseline=run(root,'baseline');if(baseline.status!==0)throw new Error('Baseline must pass before any mutation is evaluated');
const counts=checkTap(baseline.stdout,46), results=[];
for(const mutation of mutations){
  const dir=mkdtempSync(join(tmpdir(),'hexu-mutant-'));
  try {
    for(const entry of ['src','test','skills','package.json'])cpSync(join(root,entry),join(dir,entry),{recursive:true});
    const path=join(dir,mutation.file),original=readFileSync(path,'utf8');
    if(original.split(mutation.from).length!==2)throw new Error(`Mutation anchor is missing/ambiguous: ${mutation.id}`);
    writeFileSync(path,original.replace(mutation.from,mutation.to));
    const p=run(dir,mutation.id),text=p.stdout;
    const total=Number([...text.matchAll(/^# tests (\d+)$/gm)].at(-1)?.[1]);
    const failed=Number([...text.matchAll(/^# fail (\d+)$/gm)].at(-1)?.[1]);
    const skipped=Number([...text.matchAll(/^# skipped (\d+)$/gm)].at(-1)?.[1]);
    const killed=p.status===1&&total===counts.total&&failed>0&&skipped===0&&text.includes('ERR_ASSERTION')&&!/SyntaxError:|ERR_MODULE_NOT_FOUND|ReferenceError:/.test(text);
    results.push({id:mutation.id,file:mutation.file,killed,total,failed});console.log(`${mutation.id}: ${killed?'caught by regression':'SURVIVED / invalid observation'}`);
  } finally {rmSync(dir,{recursive:true,force:true});}
}
writeFileSync(join(reports,'mutation.json'),JSON.stringify({source:process.env.GITHUB_SHA??process.env.HEXU_SOURCE_SHA??'local',scope:'eight targeted mutation sentinels, not exhaustive mutation testing',baseline:counts,mutations:results,passed:results.every(r=>r.killed)},null,2)+'\n');
if(results.some(r=>!r.killed))process.exitCode=1;
