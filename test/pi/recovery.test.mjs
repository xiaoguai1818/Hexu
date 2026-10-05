import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {modelServer} from '../fixtures/model-server.mjs';

test('actual Pi/Web process death preserves history and admission, restarts as interrupted without repeating the model request',{timeout:30000},async()=>{
  const root=mkdtempSync(join(tmpdir(),'hexu-pi-restart-'));
  const model=modelServer();let child;
  async function stop(){if(child&&child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');child.kill('SIGKILL');await ended;}}
  try{
    model.server.listen(0,'127.0.0.1');await once(model.server,'listening');
    const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));const origin=`http://127.0.0.1:${port}`;
    const data=join(root,'data');mkdirSync(data);writeFileSync(join(root,'key'),'synthetic-model-key');
    writeFileSync(join(root,'model.json'),JSON.stringify({schema:1,model:'hexu-test-model',baseUrl:`http://127.0.0.1:${model.server.address().port}/v1`,allowInsecureHttp:true,apiKeyFile:join(root,'key'),maxConcurrent:1,dailyRequests:1,maxOutputTokens:128,timeoutMs:15000,maxInputChars:32000}));
    const env={...process.env,HEXU_DATA_DIR:data,HEXU_PUBLIC_ORIGIN:origin,HEXU_ALLOW_INSECURE_HTTP:'1',HEXU_BIND:'127.0.0.1',HEXU_PI_CONFIG:join(root,'model.json'),PORT:String(port)};
    const provision=spawnSync(process.execPath,['bin/add-user.mjs'],{env,input:JSON.stringify({username:'owner',password:'Synthetic test password only'}),encoding:'utf8',timeout:10000});assert.equal(provision.status,0,provision.stderr);
    async function start(){
      child=spawn(process.execPath,['bin/server.mjs'],{env,stdio:['ignore','ignore','pipe']});child.stderr.resume();
      for(let n=0;n<100;n++){assert.equal(child.exitCode,null,'Web startup exited');try{if((await fetch(origin+'/healthz',{signal:AbortSignal.timeout(200)})).ok)return;}catch{}await delay(25);}throw new Error('startup deadline');
    }
    await start();let cookie='',csrf='';
    async function request(path,body){const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-Hexu-CSRF':csrf},...(body?{body:JSON.stringify(body)}:{})});return {response,data:await response.json()};}
    const login=await request('/api/login',{username:'owner',password:'Synthetic test password only'});assert.equal(login.response.status,200);cookie=login.response.headers.get('set-cookie').split(';')[0];csrf=login.data.csrf;
    const {data:project}=await request('/api/projects',{name:'Recovery'});const {data:created}=await request(`/api/projects/${project.id}/tasks`,{title:'Pending real Pi discussion',reviewerId:login.data.user.id});
    const accepted=await request(`/api/tasks/${created.task.id}/discuss`,{version:1,body:'[SLOW] requirements discussion'});assert.equal(accepted.response.status,202);
    for(let n=0;model.requests.length===0&&n<100;n++)await delay(25);assert.equal(model.requests.length,1);
    const duplicate=spawnSync(process.execPath,['bin/server.mjs'],{env:{...env,PORT:String(port+1)},encoding:'utf8',timeout:5000});assert.equal(duplicate.status,1);assert.match(duplicate.stderr,/DISCUSSION_OWNER_ACTIVE/);
    await stop();await start();
    const recovered=(await request(`/api/tasks/${created.task.id}`)).data.task;assert.equal(recovered.runs.length,1);assert.equal(recovered.runs[0].status,'interrupted');assert.equal(recovered.state,'discussing');assert.equal(recovered.comments.length,1);assert.deepEqual(recovered.runs[0].usage,{status:'not_reported'});
    await delay(300);assert.equal(model.requests.length,1,'restart must not repeat an uncertain model call');
    const capped=await request(`/api/tasks/${created.task.id}/discuss`,{version:recovered.version,body:'another question'});assert.equal(capped.response.status,429);assert.equal(capped.data.error,'DISCUSSION_LIMIT');
  }finally{await stop();model.server.closeAllConnections();await new Promise(r=>model.server.close(r));rmSync(root,{recursive:true,force:true});}
});
