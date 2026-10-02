import {createWebApp} from '../dist/adapters/http/server.js';
import {resolve} from 'node:path';

process.umask(0o077);
const app=createWebApp({directory:resolve(process.env.HEXU_DATA_DIR??'.data'),origin:process.env.HEXU_PUBLIC_ORIGIN??'',allowInsecureHttp:process.env.HEXU_ALLOW_INSECURE_HTTP==='1',webRoot:resolve('web')});
const port=Number(process.env.PORT??8080);
if(!Number.isInteger(port)||port<1||port>65535){app.close();throw new Error('Invalid PORT');}
app.server.listen(port,process.env.HEXU_BIND??'127.0.0.1',()=>console.log(`Hexu Web listening on port ${port}; Pi/Host not connected`));
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  if(stopping)return;stopping=true;
  const timer=setTimeout(()=>{app.server.closeAllConnections();},5000);timer.unref();
  app.server.close(()=>{clearTimeout(timer);app.close();process.exit(0);});
});
