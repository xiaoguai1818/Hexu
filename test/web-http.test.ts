import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {createWebApp} from '../src/adapters/http/server.ts';

async function setup(t:{after:(f:()=>Promise<void>)=>void}) {
  const dir=mkdtempSync(join(tmpdir(),'hexu-http-'));const app=createWebApp({directory:dir,origin:'http://127.0.0.1:8080',allowInsecureHttp:true,webRoot:resolve('web')});
  await app.auth.provision('owner','Test only passphrase 2026');await app.auth.provision('member','Test only passphrase 2026');
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const address=app.server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
  t.after(async()=>{await new Promise<void>((r,e)=>app.server.close(error=>error?e(error):r()));app.close();rmSync(dir,{recursive:true,force:true});});
  async function request(path:string,method='GET',body?:unknown,cookie='',csrf='',extra:Record<string,string>={}) {
    const headers:Record<string,string>={Origin:'http://127.0.0.1:8080','Content-Type':'application/json',Cookie:cookie,'X-Hexu-CSRF':csrf,...extra};
    const result=await fetch(base+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:result.status,headers:result.headers,text:await result.text()};
  }
  const login=await request('/api/login','POST',{username:'owner',password:'Test only passphrase 2026'});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0]!;const csrf=JSON.parse(login.text).csrf;
  return {app,base,request,cookie,csrf};
}
test('web: session cookie and response headers protect credentials',async t=>{
  const f=await setup(t),r=await f.request('/api/session','GET',undefined,f.cookie);assert.equal(JSON.parse(r.text).user.username,'owner');assert.ok(!r.text.includes('password'));
  const login=await f.request('/api/login','POST',{username:'owner',password:'Test only passphrase 2026'});
  assert.match(login.headers.get('set-cookie')!,/HttpOnly; SameSite=Strict/);assert.ok(!login.text.includes('token'));
  assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-security-policy')!,/frame-ancestors 'none'/);
  assert.equal(JSON.parse((await f.request('/api/session')).text).user,null);
});
test('web: account login failures, CSRF and caller-supplied identities fail closed',async t=>{
  const f=await setup(t);
  assert.equal((await f.request('/api/login','POST',{username:'owner',password:'wrong'})).status,401);
  assert.equal((await f.request('/api/projects')).status,401);
  assert.equal((await f.request('/api/projects','POST',{name:'project'},f.cookie)).status,403);
  assert.equal((await f.request('/api/projects','POST',{name:'project'},f.cookie,f.csrf,{Origin:'https://evil.invalid'})).status,403);
  assert.equal((await f.request('/api/projects','POST',{name:'project',ownerId:'other'},f.cookie,f.csrf)).status,400);
  const created=await f.request('/api/projects','POST',{name:'Project'},f.cookie,f.csrf);assert.equal(created.status,201);
  const project=JSON.parse(created.text);assert.equal(project.ownerId,f.app.workspace.list(JSON.parse((await f.request('/api/session','GET',undefined,f.cookie)).text).user.id)[0]?.ownerId);
});
test('web: real project, members, task and comments persist through the public API',async t=>{
  const f=await setup(t);const p=JSON.parse((await f.request('/api/projects','POST',{name:'Team'},f.cookie,f.csrf)).text);
  assert.equal((await f.request(`/api/projects/${p.id}/members`,'POST',{username:'member',canExecute:false},f.cookie,f.csrf)).status,200);
  const r=await f.request(`/api/projects/${p.id}/tasks`,'POST',{title:'需求未成熟',reviewerId:p.ownerId},f.cookie,f.csrf);assert.equal(r.status,201);const task=JSON.parse(r.text).task;
  const c=await f.request(`/api/tasks/${task.id}/comment`,'POST',{version:1,body:'先讨论，不要开发'},f.cookie,f.csrf);assert.equal(c.status,200);assert.equal(JSON.parse(c.text).task.state,'discussing');
  assert.equal((await f.request(`/api/tasks/${task.id}/comment`,'POST',{version:1,body:'stale'},f.cookie,f.csrf)).status,409);
  assert.equal(JSON.parse((await f.request(`/api/projects/${p.id}/tasks`,'GET',undefined,f.cookie)).text).tasks.length,1);
  assert.equal((await f.request(`/api/tasks/${task.id}/discuss`,'POST',{version:2,body:'ask'},f.cookie,f.csrf)).status,503);
  assert.equal((await f.request(`/api/tasks/${task.id}/queue`,'POST',{version:2,scope:'confirmed',environmentId:'unknown'},f.cookie,f.csrf)).status,503);
  const stored=JSON.parse((await f.request(`/api/tasks/${task.id}`,'GET',undefined,f.cookie)).text).task;assert.equal(stored.runs.length,0);assert.equal(stored.version,2);
  const login=await f.request('/api/login','POST',{username:'member',password:'Test only passphrase 2026'});const memberCookie=login.headers.get('set-cookie')!.split(';')[0]!;const memberCsrf=JSON.parse(login.text).csrf;
  assert.equal((await f.request(`/api/tasks/${task.id}/queue`,'POST',{version:2},memberCookie,memberCsrf)).status,403);
  const user=JSON.parse(login.text).user;await f.request(`/api/projects/${p.id}/members/${user.id}`,'DELETE',undefined,f.cookie,f.csrf);
  assert.equal((await f.request(`/api/tasks/${task.id}`,'GET',undefined,memberCookie)).status,403);
  assert.equal((await f.request(`/api/projects/${p.id}`,'GET',undefined,memberCookie)).status,403);
});
test('web: static assets are served by an exact allowlist, never filesystem paths',async t=>{
  const f=await setup(t);assert.match((await f.request('/')).text,/Hexu/);
  for(const path of ['/app.js','/api.js','/views.js','/styles.css'])assert.equal((await f.request(path)).status,200);
  for(const path of ['/.env','/package.json','/src/index.ts','/data/tasks.sqlite','/api/__fixture/worker','/api/unknown','/missing.js'])assert.equal((await f.request(path)).status,404);
  assert.equal((await f.request('/api/projects','PUT',{},f.cookie,f.csrf)).status,404);
  assert.equal((await f.request('/api/projects','POST',[],f.cookie,f.csrf)).status,400);
  assert.equal((await f.request('/api/projects','POST',{},f.cookie,f.csrf,{'Content-Type':'text/plain'})).status,415);
  assert.equal((await f.request('/api/projects','POST',{name:'x'.repeat(70000)},f.cookie,f.csrf)).status,413);
  assert.equal((await f.request('/api/logout','POST',{},f.cookie,f.csrf)).status,200);assert.equal((await f.request('/api/projects','GET',undefined,f.cookie)).status,401);
});
test('web: unsafe/missing deployment origin is rejected before opening storage',()=>{
  for(const origin of ['', 'ftp://app', 'https://app/path','https://user:pass@app'])assert.throws(()=>createWebApp({directory:'/not-opened',origin,webRoot:'web'}));
  assert.throws(()=>createWebApp({directory:'/not-opened',origin:'http://app',webRoot:'web'}));
});
