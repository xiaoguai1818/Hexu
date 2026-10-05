import {parentPort,workerData} from 'node:worker_threads';
import {createPiRuntime} from './runtime.mjs';
const controller=new AbortController();
parentPort.on('message',message=>{if(message==='abort')controller.abort();});
try{
  const result=await createPiRuntime(workerData.config,workerData.skill).respond(workerData.input,controller.signal);
  parentPort.postMessage({ok:true,result});
}catch{parentPort.postMessage({ok:false});}
finally{parentPort.close();}
