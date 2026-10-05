import {createWebApp} from '../dist/adapters/http/server.js';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {readPiConfig} from '../dist/adapters/pi/config.js';

process.umask(0o077);
const config=readPiConfig(process.env.HEXU_PI_CONFIG);
const discussion=config?{runtime:(await import('../runners/pi/bridge.mjs')).createPiRuntime(config,readFileSync('skills/requirements/SKILL.md','utf8')),maxConcurrent:config.maxConcurrent,dailyLimit:config.dailyRequests,timeoutMs:config.timeoutMs}:undefined;
const app=createWebApp({directory:resolve(process.env.HEXU_DATA_DIR??'.data'),origin:process.env.HEXU_PUBLIC_ORIGIN??'',allowInsecureHttp:process.env.HEXU_ALLOW_INSECURE_HTTP==='1',webRoot:resolve('web'),...(discussion?{discussion}:{})});
const port=Number(process.env.PORT??8080);
if(!Number.isInteger(port)||port<1||port>65535){app.close();throw new Error('Invalid PORT');}
app.server.listen(port,process.env.HEXU_BIND??'127.0.0.1',()=>console.log(`Hexu Web listening on port ${port}; discussion ${discussion?'enabled':'disabled'}, development disabled`));
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  if(stopping)return;stopping=true;
  const timer=setTimeout(()=>{app.server.closeAllConnections();},5000);timer.unref();
  app.server.close(async()=>{clearTimeout(timer);await app.shutdown();process.exit(0);});
});
