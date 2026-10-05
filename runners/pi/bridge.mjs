import {Worker} from 'node:worker_threads';
/** Each discussion has a disposable, bounded isolate. No worker receives a project path or ambient credentials. */
export function createPiRuntime(config,skill){
  return {
    identity:Object.freeze({provider:'hexu-approved',model:config.model,version:'1.0.3'}),
    respond(input,signal){
      if(signal.aborted)return Promise.reject(new Error('DISCUSSION_ABORTED'));
      return new Promise((resolve,reject)=>{
        const worker=new Worker(new URL('./worker.mjs',import.meta.url),{
          workerData:{config,skill,input},env:{PI_OFFLINE:'1',NODE_ENV:'production'},
          resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32,stackSizeMb:4},stdout:true,stderr:true,
        });
        // SDK/provider diagnostics must never be forwarded to application logs or browser output.
        worker.stdout.resume();worker.stderr.resume();
        let outcome,failed=false,forced,cancelled=false;
        const abort=()=>{cancelled=true;worker.postMessage('abort');forced??=setTimeout(()=>void worker.terminate(),1000);};
        const deadline=setTimeout(abort,config.timeoutMs??60000);
        signal.addEventListener('abort',abort,{once:true});
        if(signal.aborted)abort();
        worker.on('message',message=>{outcome=message;void worker.terminate();});
        worker.on('error',()=>{failed=true;});
        worker.on('exit',()=>{
          clearTimeout(deadline);if(forced)clearTimeout(forced);signal.removeEventListener('abort',abort);
          if(cancelled||signal.aborted||failed||!outcome?.ok)reject(new Error('PI_DISCUSSION_FAILED'));
          else resolve(outcome.result);
        });
      });
    },
  };
}
