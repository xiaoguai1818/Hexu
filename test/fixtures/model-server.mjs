// Deterministic OpenAI-compatible test endpoint. Never a production model or a Hexu API.
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
export function modelServer(){
  const requests=[];
  const server=createServer(async(req,res)=>{
    if(req.url==='/health'){res.end('ok');return;}
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);requests.push(body);
    if(req.url!=='/v1/chat/completions'||body.tools?.length){res.writeHead(400);res.end(JSON.stringify({error:{message:'unexpected route/tools'}}));return;}
    const prompt=JSON.stringify(body.messages);
    if(prompt.includes('[FAIL]')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'PRIVATE-UPSTREAM-SECRET'}}));return;}
    if(prompt.includes('[SLOW]')){res.writeHead(200,{'Content-Type':'text/event-stream'});res.flushHeaders();return;}
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    const emit=(delta,finish=null)=>res.write('data: '+JSON.stringify({id:'test-completion',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta,finish_reason:finish}]})+'\n\n');
    emit({role:'assistant'});
    if(prompt.includes('[TOOL]'))emit({tool_calls:[{index:0,id:'call-test',type:'function',function:{name:'write',arguments:'{"path":"unauthorized.txt","content":"forbidden"}'}}]},'tool_calls');
    else emit({content:'测试模型答复：请确认使用场景、输入输出与验收条件。当前只梳理需求，没有开发代码。'},prompt.includes('[LENGTH]')?'length':'stop');
    if(!prompt.includes('[MISSING_USAGE]'))res.write('data: '+JSON.stringify({id:'test-completion',object:'chat.completion.chunk',created:1,model:body.model,choices:[],usage:{prompt_tokens:40,completion_tokens:20,total_tokens:60}})+'\n\n');
    res.end('data: [DONE]\n\n');
  });
  return {server,requests};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const {server}=modelServer();server.listen(Number(process.env.PORT??9090),'0.0.0.0',()=>console.log('Synthetic model endpoint only; no live AI invocation'));
  process.on('SIGTERM',()=>{server.closeAllConnections();server.close();});
}
