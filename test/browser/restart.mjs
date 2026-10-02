import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const privateDirectory=process.env.HEXU_TEST_PRIVATE_DIR??'/test-private';
const origin=process.env.HEXU_TEST_URL,file=join(privateDirectory,'restart-session.json');
if(process.argv[2]==='prepare'){
  const accounts=JSON.parse(readFileSync(join(privateDirectory,'accounts.json'),'utf8'));
  const response=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'owner',password:accounts.owner})});assert.equal(response.status,200);
  const session=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];
  const send=async(path,body)=>{const result=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-Hexu-CSRF':session.csrf},body:JSON.stringify(body)});assert.ok(result.ok);return result.json();};
  const project=await send('/api/projects',{name:'Web restart persistence'});const result=await send(`/api/projects/${project.id}/tasks`,{title:'重启后保留的任务',reviewerId:session.user.id});
  const updated=await send(`/api/tasks/${result.task.id}/comment`,{version:result.task.version,body:'经过真实 HTTP 保存的评论'});
  writeFileSync(file,JSON.stringify({cookie,task:updated.task}));console.log('Saved task and authenticated session through actual Web API');
}else if(process.argv[2]==='verify'){
  const expected=JSON.parse(readFileSync(file,'utf8'));const response=await fetch(origin+`/api/tasks/${expected.task.id}`,{headers:{Cookie:expected.cookie}});assert.equal(response.status,200);assert.deepEqual((await response.json()).task,expected.task);
  console.log('Actual Web session, task and comments survive process restart/container recreation');
}else throw new Error('Unknown lifecycle phase');
