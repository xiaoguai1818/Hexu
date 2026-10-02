// Supplementary local browser verification. All accounts/data are disposable.
// The authoritative full container matrix still runs in GitHub Actions.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,writeFileSync,createWriteStream,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

const directory=mkdtempSync(join(tmpdir(),'hexu-web-local-'));
const reports=resolve('ci-results/local-browser');mkdirSync(reports,{recursive:true});
mkdirSync(join(directory,'data'));
writeFileSync(join(directory,'accounts.json'),JSON.stringify(Object.fromEntries(['owner','member','outsider'].map(name=>[name,randomBytes(24).toString('hex')]))),{mode:0o600});
const net=createServer();net.listen(0,'127.0.0.1');await once(net,'listening');const port=net.address().port;await new Promise(r=>net.close(r));
const origin=`http://127.0.0.1:${port}`;
const env={...process.env,HEXU_DATA_DIR:join(directory,'data'),HEXU_TEST_DATA_DIR:join(directory,'data'),HEXU_TEST_PRIVATE_DIR:directory,HEXU_TEST_ACCOUNTS:join(directory,'accounts.json'),HEXU_TEST_SEED:join(directory,'seed.json'),HEXU_REPORT_DIR:reports,HEXU_PUBLIC_ORIGIN:origin,HEXU_TEST_URL:origin,HEXU_ALLOW_INSECURE_HTTP:'1',HEXU_BIND:'127.0.0.1',PORT:String(port)};
let child;
const log=createWriteStream(join(reports,'server.log'));
async function command(args){
  const processChild=spawn(process.execPath,args,{env,stdio:'inherit',timeout:300000,killSignal:'SIGKILL'});
  const [code,signal]=await once(processChild,'exit');if(code!==0||signal)throw new Error(`Local check failed: ${args[0]} (${code??signal})`);
}
async function start(){
  child=spawn(process.execPath,['bin/server.mjs'],{env,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  for(let n=0;n<100;n++){
    if(child.exitCode!==null)throw new Error('Local Web server exited during startup');
    try{if((await fetch(origin+'/healthz',{signal:AbortSignal.timeout(500)})).ok)return;}catch{}
    await delay(100);
  }
  throw new Error('Local Web startup deadline exceeded');
}
async function stop(signal='SIGTERM'){
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const closing=once(child,'exit');child.kill(signal);const timeout=setTimeout(()=>child.kill('SIGKILL'),6000);try{await closing;}finally{clearTimeout(timeout);}
}
try{
  await command(['test/fixtures/web-seed.mjs']);await start();
  await command(['node_modules/@playwright/test/cli.js','test','--config','ci/playwright.config.mjs']);
  await command(['scripts/browser-report.mjs',join(reports,'results.json')]);
  await command(['test/browser/restart.mjs','prepare']);await stop('SIGKILL');await start();await command(['test/browser/restart.mjs','verify']);
  writeFileSync(join(reports,'local-evidence.json'),JSON.stringify({scope:'actual local Web and browser; synthetic accounts and deliveries; no Pi/Host',platform:process.platform,node:process.version,tests:'results.json',restart:true,passed:true},null,2));
}finally{await stop();log.end();rmSync(directory,{recursive:true,force:true});}
