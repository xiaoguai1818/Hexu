import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
export const base=process.env.HEXU_TEST_URL??'http://app:8080';
export const peer=process.env.HEXU_TEST_PEER_URL??'http://app-peer:8080';
const credentials=JSON.parse(readFileSync(process.env.HEXU_CI_CREDENTIALS??'/run/hexu-ci/credentials.json','utf8'));
export async function request(path,{actor='owner',body,method=body===undefined?'GET':'POST',url=base,expected=200}={}) {
  const result=await fetch(url+path,{method,headers:{Authorization:`Bearer ${credentials[actor]??'invalid-test-token'}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
  const data=await result.json();
  if(expected!==null) assert.equal(result.status,expected,`${method} ${path}: ${data.error??'unexpected response'}`);
  return {status:result.status,data};
}
export async function create(title='CI disposable task') {return (await request('/tasks',{body:{projectId:'p',title,reviewerId:'reviewer'},expected:201})).data;}
export async function action(task,name,extra={},actor='owner',options={}) {return (await request(`/tasks/${task.id}/${name}`,{actor,body:{version:task.version,...extra},...options})).data;}
export async function worker(task,name,extra={}) {return (await request('/__fixture/worker',{actor:'worker',body:{action:name,taskId:task.id,runId:task.runs.at(-1).id,...extra}})).data;}
export const delivery={summary:'Synthetic runner delivered parser',verification:'CI fixture evidence; not a real Pi or hardware run',artifacts:[{name:'fixture report',reference:'fixture:report'}],unresolved:[]};
