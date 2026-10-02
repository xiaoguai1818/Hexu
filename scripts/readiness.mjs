import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=process.cwd(),doc=readFileSync('docs/acceptance.md','utf8');
const expected=[...doc.matchAll(/^\| (A\d+) \|/gm)].map(x=>x[1]).sort();
const coverage=JSON.parse(readFileSync('ci/acceptance-coverage.json','utf8'));
const ids=coverage.items.map(x=>x.id).sort();
if(JSON.stringify(ids)!==JSON.stringify(expected)||new Set(ids).size!==ids.length)throw new Error('Business acceptance coverage has missing or duplicate entries');
for(const item of coverage.items){
  if(!['not_implemented','core_only','web_partial'].includes(item.level))throw new Error('Full Pi/Host acceptance is not implemented; partial Web evidence cannot certify the product');
  if(item.level==='web_partial'&&!item.tests.includes('test/browser/workspace.spec.mjs'))throw new Error(`Web evidence must cite actual browser tests: ${item.id}`);
  if(typeof item.missing!=='string'||!item.missing.trim())throw new Error(`Missing limitation: ${item.id}`);
  for(const path of item.tests)if(!path.startsWith('test/')||path.includes('..')||!existsSync(resolve(root,path)))throw new Error(`Broken test reference: ${path}`);
}
const directory=resolve(process.env.HEXU_REPORT_DIR??'ci-results/readiness');mkdirSync(directory,{recursive:true});
const report={source:process.env.GITHUB_SHA??process.env.HEXU_SOURCE_SHA??'local',releaseReady:false,blocked:coverage.items};
writeFileSync(join(directory,'readiness.json'),JSON.stringify(report,null,2)+'\n');
const markdown=['## Product acceptance: NOT READY','',`Engineering checks do not certify the ${ids.length} product acceptance requirements.`, '', '| Requirement | Current evidence | Still required |','| --- | --- | --- |',...coverage.items.map(x=>`| ${x.id} | ${x.level} | ${x.missing} |`),''].join('\n');
writeFileSync(join(directory,'readiness.md'),markdown);console.log(markdown);
if(process.argv.includes('--require-product')){console.error('PRODUCT_ACCEPTANCE_BLOCKED: Web collaboration is partial; real Pi/Host and complete acceptance remain unimplemented');process.exitCode=1;}
