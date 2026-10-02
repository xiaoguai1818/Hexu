import {createServer} from 'node:http';
import type {IncomingMessage} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {SqliteWorkspace} from '../sqlite/workspace.ts';
import {SqliteTasks} from '../sqlite/task-repository.ts';
import {CryptoPasswords} from '../auth/crypto-passwords.ts';
import {AuthService} from '../../application/auth-service.ts';
import {WorkspaceService} from '../../application/workspace-service.ts';
import {TaskService} from '../../application/task-service.ts';
import {DomainError} from '../../core/errors.ts';
import type {Task} from '../../core/task.ts';

type Options={directory:string;origin:string;allowInsecureHttp?:boolean;webRoot:string};
const availability={discussion:false,development:false,reason:'Pi 与开发环境尚未接入；可以保存想法和协作评论。'};
function fields(value:Record<string,unknown>,keys:string[]) {
  if(Object.keys(value).some(key=>!keys.includes(key)))throw new DomainError('INVALID_INPUT');return value;
}
async function body(req:IncomingMessage):Promise<Record<string,unknown>> {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw new DomainError('CONTENT_TYPE');
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>65536)throw new DomainError('BODY_TOO_LARGE');chunks.push(chunk);}
  try{const data:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data as Record<string,unknown>;}
  catch{throw new DomainError('INVALID_INPUT');}
}
function cookie(req:IncomingMessage):string {
  const values=(req.headers.cookie??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('hexu_session='));
  return values.length===1?values[0]!.slice(13):'';
}
export function createWebApp(options:Options) {
  const origin=new URL(options.origin);
  if(!['http:','https:'].includes(origin.protocol)||origin.origin!==options.origin||(origin.protocol==='http:'&&!options.allowInsecureHttp))throw new Error('HEXU_PUBLIC_ORIGIN must be an exact HTTPS origin (explicit insecure opt-in for isolated local testing)');
  const assets=new Map<string,{type:string;data:Buffer}>();
  for(const [name,type] of [['index.html','text/html'],['app.js','text/javascript'],['api.js','text/javascript'],['views.js','text/javascript'],['styles.css','text/css']])assets.set(name==='index.html'?'/':`/${name}`,{type:type!+'; charset=utf-8',data:readFileSync(join(options.webRoot,name!))});
  const store=new SqliteWorkspace(join(options.directory,'workspace.sqlite'));
  let repository:SqliteTasks;
  try{repository=new SqliteTasks(join(options.directory,'tasks.sqlite'));}catch(error){store.close();throw error;}
  const auth=new AuthService(store,new CryptoPasswords(),Date.now),workspace=new WorkspaceService(store,randomUUID);
  const tasks=new TaskService({tasks:repository,memberships:store,ids:randomUUID,now:()=>new Date().toISOString()});
  function taskView(actor:string,task:Task) {
    return {task,permissions:{canExecute:store.lookup(task.projectId,actor)?.canExecute===true,canReview:task.reviewerId===actor},availability};
  }
  const server=createServer(async(req,res)=>{
    const headers:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
    const send=(status:number,value:unknown,extra:Record<string,string>={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(value));};
    try {
      const path=new URL(req.url??'/',options.origin).pathname,method=req.method;
      const asset=assets.get(path);if(method==='GET'&&asset){res.writeHead(200,{...headers,'Content-Type':asset.type});res.end(asset.data);return;}
      if(path==='/healthz'&&method==='GET'){store.projects('_health');repository.list('_health');return send(200,{status:'ok',service:'hexu-web'});}
      if(!path.startsWith('/api/'))return send(404,{error:'NOT_FOUND'});
      const write=method!=='GET';
      if(write&&req.headers.origin!==options.origin)throw new DomainError('CSRF');
      if(path==='/api/login'&&method==='POST') {
        const b=fields(await body(req),['username','password']);const login=await auth.login(b['username'],b['password'],req.socket.remoteAddress??'unknown');
        const previous=cookie(req);if(previous)auth.logout(previous);
        return send(200,{user:login.user,csrf:login.csrf},{'Set-Cookie':`hexu_session=${login.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${origin.protocol==='https:'?'; Secure':''}`});
      }
      const token=cookie(req);
      if(path==='/api/session'&&method==='GET') {
        try{return send(200,{...auth.authenticate(token),availability});}catch(error){if(error instanceof DomainError&&error.code==='UNAUTHENTICATED')return send(200,{user:null});throw error;}
      }
      // Unknown paths cannot become a worker/admin backdoor.
      const projectRoute=path.match(/^\/api\/projects\/([A-Za-z0-9_-]+)(?:\/(tasks|members)(?:\/([A-Za-z0-9_-]+))?)?$/);
      const taskRoute=path.match(/^\/api\/tasks\/([A-Za-z0-9_-]+)(?:\/(comment|discuss|queue|review|cancel))?$/);
      if(!projectRoute&&!taskRoute&&!['/api/projects','/api/logout'].includes(path))return send(404,{error:'NOT_FOUND'});
      const session=auth.authenticate(token),actor=session.user.id;
      if(write&&req.headers['x-hexu-csrf']!==session.csrf)throw new DomainError('CSRF');
      if(path==='/api/logout'&&method==='POST'){auth.logout(token);return send(200,{ok:true},{'Set-Cookie':`hexu_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${origin.protocol==='https:'?'; Secure':''}`});}
      if(path==='/api/projects') {
        if(method==='GET')return send(200,{projects:workspace.list(actor)});
        if(method==='POST'){const b=fields(await body(req),['name']);return send(201,workspace.create(actor,b['name']));}
      }
      if(projectRoute) {
        const [,id,op,userId]=projectRoute;const p=workspace.get(actor,id!);
        if(method==='GET'&&!op)return send(200,p);
        if(op==='members'&&method==='POST'&&!userId){const b=fields(await body(req),['username','canExecute']);return send(200,workspace.addMember(actor,p.id,b['username'],b['canExecute']));}
        if(op==='members'&&method==='DELETE'&&userId)return send(200,workspace.removeMember(actor,p.id,userId));
        if(op==='tasks'&&!userId){
          if(method==='GET')return send(200,{tasks:tasks.list(actor,p.id),availability});
          if(method==='POST'){const b=fields(await body(req),['title','reviewerId']);return send(201,taskView(actor,tasks.create({actorId:actor,projectId:p.id,title:b['title'] as string,reviewerId:b['reviewerId'] as string})));}
        }
      }
      if(taskRoute) {
        const [,id,op]=taskRoute;const task=tasks.get(actor,id!);
        if(method==='GET'&&!op)return send(200,taskView(actor,task));
        if(method==='POST'&&op){
          const b=await body(req);let result:Task;
          switch(op){
            case 'comment':fields(b,['version','body']);result=tasks.comment(actor,task.id,b['version'] as number,b['body'] as string);break;
            case 'review':fields(b,['version','body','intent']);result=tasks.review(actor,task.id,b['version'] as number,{body:b['body'] as string,intent:b['intent'] as 'accept'|'discuss'});break;
            case 'cancel':fields(b,['version']);result=tasks.requestCancel(actor,task.id,b['version'] as number);break;
            case 'queue':if(!store.lookup(task.projectId,actor)?.canExecute)throw new DomainError('EXECUTION_FORBIDDEN');throw new DomainError('ENVIRONMENT_NOT_READY');
            case 'discuss':throw new DomainError('PI_NOT_READY');
            default:throw new DomainError('INVALID_INPUT');
          }
          return send(200,taskView(actor,result));
        }
      }
      send(404,{error:'NOT_FOUND'});
    }catch(error){
      const codes:Record<string,number>={UNAUTHENTICATED:401,FORBIDDEN:403,EXECUTION_FORBIDDEN:403,REVIEW_FORBIDDEN:403,PROJECT_OWNER_REQUIRED:403,OWNER_REQUIRED:409,CSRF:403,INVALID_INPUT:400,CONTENT_TYPE:415,BODY_TOO_LARGE:413,ACCOUNT_NOT_FOUND:404,RATE_LIMITED:429,PI_NOT_READY:503,ENVIRONMENT_NOT_READY:503,CORRUPT_SNAPSHOT:500};
      const code=error instanceof DomainError?error.code:'INTERNAL_ERROR';const status=error instanceof DomainError?(codes[code]??409):500;
      send(status,{error:code},status===429?{'Retry-After':'900'}:{});
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
  return {server,auth,workspace,tasks,close:()=>{repository.close();store.close();}};
}
