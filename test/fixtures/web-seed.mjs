// Offline synthetic seed, only mounted in disposable test containers. Not part of runtime image.
import {SqliteWorkspace} from '../../dist/adapters/sqlite/workspace.js';
import {CryptoPasswords} from '../../dist/adapters/auth/crypto-passwords.js';
import {AuthService} from '../../dist/application/auth-service.js';
import {WorkspaceService} from '../../dist/application/workspace-service.js';
import {SqliteTasks} from '../../dist/adapters/sqlite/task-repository.js';
import {TaskService} from '../../dist/application/task-service.js';
import {RunService} from '../../dist/application/run-service.js';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const dataDirectory=process.env.HEXU_TEST_DATA_DIR??'/data';
const privateDirectory=process.env.HEXU_TEST_PRIVATE_DIR??'/test-private';
const credentials=JSON.parse(readFileSync(join(privateDirectory,'accounts.json'),'utf8'));
const store=new SqliteWorkspace(join(dataDirectory,'workspace.sqlite')),repo=new SqliteTasks(join(dataDirectory,'tasks.sqlite'));
try{
  const auth=new AuthService(store,new CryptoPasswords(),Date.now),workspace=new WorkspaceService(store,randomUUID);const users={};
  for(const name of ['owner','member','outsider'])users[name]=await auth.provision(name,credentials[name]);
  const project=workspace.create(users.owner.id,'团队试点');workspace.addMember(users.owner.id,project.id,'member',false);
  workspace.create(users.outsider.id,'隔离项目');
  const tasks=new TaskService({tasks:repo,memberships:store,ids:randomUUID,now:()=>new Date().toISOString()}),runs=new RunService(repo,()=>new Date().toISOString());
  const ids={};for(const name of ['待验收样本','返工样本','完成后评论样本']){
    let task=tasks.create({actorId:users.owner.id,projectId:project.id,title:name,reviewerId:users.owner.id});
    task=tasks.queue(users.owner.id,task.id,task.version,{scope:'合成验收样本，不是真实 AI 开发',environmentId:'fixture'});
    task=runs.start(task.id,task.runs[0].id);task=runs.finish(task.id,task.runs[0].id,{summary:'合成测试交付，用于验证页面与验收操作',verification:'测试夹具证据，不是真实 Pi/硬件结果',artifacts:[{name:'示例报告',reference:'fixture:report'}],unresolved:[]});
    if(name==='完成后评论样本')task=tasks.review(users.owner.id,task.id,task.version,{intent:'accept',body:'合成验收记录'});ids[name]=task.id;
  }
  writeFileSync(join(privateDirectory,'seed.json'),JSON.stringify({project,users,ids}));console.log('Synthetic users/projects/tasks prepared; no real Pi invocation');
}finally{repo.close();store.close();}
