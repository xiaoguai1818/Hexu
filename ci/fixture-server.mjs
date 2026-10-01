// TEST ONLY: adapts the compiled Hexu core to HTTP for deployment verification.
// Not the product API, login service, production worker, or a simulated success backend.
import {createServer} from 'node:http';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {TaskService,RunService,SqliteTasks,DomainError} from '../dist/index.js';

if(process.env.HEXU_CI_FIXTURE!=='1') throw new Error('CI_FIXTURE_ONLY');
const filename=process.env.HEXU_CI_DATABASE??'/data/tasks.sqlite';
const credentials=JSON.parse(readFileSync('/run/hexu-ci/credentials.json','utf8'));
for(const role of ['owner','member','reviewer','worker','outsider','platform-admin']) if(typeof credentials[role]!=='string'||credentials[role].length<32) throw new Error('INVALID_FIXTURE_CREDENTIALS');
const repo=new SqliteTasks(filename);
const members=new Map([['p:owner',true],['p:member',false],['p:reviewer',false],['q:outsider',true]]);
const tasks=new TaskService({tasks:repo,memberships:{lookup(project,user){return members.has(`${project}:${user}`)?{userId:user,canExecute:members.get(`${project}:${user}`)}:undefined;}},ids:randomUUID,now:()=>new Date().toISOString()});
const runs=new RunService(repo,()=>new Date().toISOString());
function authenticate(req) {
  const candidate=Buffer.from((req.headers.authorization??'').replace(/^Bearer /,''));
  for(const [role,token] of Object.entries(credentials)){const value=Buffer.from(token);if(value.length===candidate.length&&timingSafeEqual(value,candidate))return role;}
  throw Object.assign(new Error('UNAUTHENTICATED'),{status:401});
}
async function json(req) {
  if(req.headers['content-type']!=='application/json') throw Object.assign(new Error('CONTENT_TYPE'),{status:415});
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Object.assign(new Error('BODY_TOO_LARGE'),{status:413});chunks.push(chunk);}
  try {const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch {throw Object.assign(new Error('INVALID_JSON'),{status:400});}
}
function workerOnly(actor){if(actor!=='worker')throw Object.assign(new Error('WORKER_ONLY'),{status:403});}
const server=createServer(async(req,res)=>{
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  try {
    const path=new URL(req.url,'http://ci.invalid').pathname;
    if(path==='/health'&&req.method==='GET'){repo.list('_health');return reply(200,{kind:'hexu-core-ci-fixture',ready:true,runtimeSource:'dist',source:process.env.HEXU_SOURCE_SHA});}
    const actor=authenticate(req);
    if(path==='/__fixture/integrity'&&req.method==='GET'){workerOnly(actor);const raw=new DatabaseSync(filename);try{return reply(200,{integrity:raw.prepare('PRAGMA integrity_check').get().integrity_check});}finally{raw.close();}}
    if(path==='/tasks'&&req.method==='POST'){const body=await json(req);return reply(201,tasks.create({actorId:actor,projectId:body.projectId,title:body.title,reviewerId:body.reviewerId}));}
    if(path==='/__fixture/worker'&&req.method==='POST'){
      workerOnly(actor);const b=await json(req);let result;
      switch(b.action){
        case 'start':result=runs.start(b.taskId,b.runId);break;
        case 'finish':result=runs.finish(b.taskId,b.runId,b.result);break;
        case 'fail':result=runs.fail(b.taskId,b.runId,b.reason);break;
        case 'interrupt':result=runs.interrupt(b.taskId,b.runId,b.reason);break;
        case 'acknowledgeCancel':result=runs.acknowledgeCancel(b.taskId,b.runId);break;
        default:throw new DomainError('INVALID_INPUT');
      }return reply(200,result);
    }
    const route=path.match(/^\/tasks\/([A-Za-z0-9_-]+)(?:\/(comment|discuss|queue|review|cancel))?$/);
    if(route){const [,id,op]=route;if(req.method==='GET'&&!op)return reply(200,tasks.get(actor,id));
      if(req.method==='POST'&&op){const b=await json(req);let result;
        switch(op){
          case 'comment':result=tasks.comment(actor,id,b.version,b.body);break;
          case 'discuss':result=tasks.discuss(actor,id,b.version,b.body);break;
          case 'queue':result=tasks.queue(actor,id,b.version,{scope:b.scope,environmentId:b.environmentId});break;
          case 'review':result=tasks.review(actor,id,b.version,{body:b.body,intent:b.intent});break;
          case 'cancel':result=tasks.requestCancel(actor,id,b.version);break;
        }return reply(200,result);
      }
    }reply(404,{error:'NOT_FOUND'});
  }catch(error){const status=error.status??(error instanceof DomainError?(error.code.includes('FORBIDDEN')?403:error.code==='INVALID_INPUT'?400:error.code==='CORRUPT_SNAPSHOT'?500:409):500);reply(status,{error:error.code??(status===500?'INTERNAL_ERROR':error.message)});}
});
server.requestTimeout=15000;server.headersTimeout=10000;server.listen(8080,'0.0.0.0',()=>console.log('Hexu compiled-core CI fixture ready; NOT a product deployment'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{repo.close();process.exit(0);}));
