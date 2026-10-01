// Child process for real SQLite startup/CAS/crash tests; no network or real data.
import {DatabaseSync} from 'node:sqlite';
import {SqliteTasks} from '../../src/adapters/sqlite/task-repository.ts';
const [mode,file,id]=process.argv.slice(2);
let db,task;
function send(value) {return new Promise(resolve=>process.send(value,()=>resolve()));}
if(mode==='cas') {db=new SqliteTasks(file);task=db.get(id);}
await send({ready:true});
process.once('message',async()=>{
  try {
    if(mode==='start') {db=new SqliteTasks(file);db.list('p');}
    else if(mode==='cas') {task.version++;task.title='winner-'+process.pid;db.save(task,task.version-1);}
    else if(mode==='crash') {
      const raw=new DatabaseSync(file);raw.exec('BEGIN IMMEDIATE');
      const row=raw.prepare('SELECT snapshot FROM tasks WHERE id=?').get(id);const next=JSON.parse(row.snapshot);next.title='UNCOMMITTED';next.version++;
      raw.prepare('UPDATE tasks SET version=?,snapshot=? WHERE id=?').run(next.version,JSON.stringify(next),id);
      await send({uncommitted:true});setInterval(()=>{},1000);return;
    } else throw new Error('unknown fixture mode');
    db?.close();await send({ok:true});process.disconnect();
  } catch(error) {db?.close();await send({ok:false,code:error.code,message:error.message});process.disconnect();}
});
