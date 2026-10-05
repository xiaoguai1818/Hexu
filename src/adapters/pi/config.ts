import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {DomainError} from '../../core/errors.ts';

export interface PiConfig {model:string;baseUrl:string;apiKey:string;maxConcurrent:number;dailyRequests:number;maxOutputTokens:number;timeoutMs:number;maxInputChars:number}
/** Explicit operator configuration. Never evaluate key commands or accept endpoints from task/browser input. */
export function readPiConfig(path:string|undefined):PiConfig|undefined {
  if(!path)return undefined;
  try{
    const c=JSON.parse(readFileSync(path,'utf8')) as Record<string,unknown>;
    const keys=['schema','model','baseUrl','apiKeyFile','maxConcurrent','dailyRequests','maxOutputTokens','timeoutMs','maxInputChars','allowInsecureHttp'];
    if(!c||c['schema']!==1||Object.keys(c).some(k=>!keys.includes(k)))throw new Error();
    if(typeof c['model']!=='string'||!c['model'].trim()||c['model'].length>200||typeof c['baseUrl']!=='string')throw new Error();
    const url=new URL(c['baseUrl']);if(url.username||url.password||url.hash||url.search||!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&c['allowInsecureHttp']!==true))throw new Error();
    for(const [key,minimum,maximum] of [['maxConcurrent',1,16],['dailyRequests',1,10000],['maxOutputTokens',64,8192],['timeoutMs',1000,300000],['maxInputChars',1000,180000]] as const)if(!Number.isSafeInteger(c[key])||Number(c[key])<minimum||Number(c[key])>maximum)throw new Error();
    if(typeof c['apiKeyFile']!=='string'||!isAbsolute(c['apiKeyFile']))throw new Error();
    const apiKey=readFileSync(c['apiKeyFile'],'utf8').trim();if(apiKey.length<8||apiKey.length>4096||/[\r\n]/.test(apiKey))throw new Error();
    return {model:c['model'],baseUrl:url.href.replace(/\/$/,''),apiKey,maxConcurrent:Number(c['maxConcurrent']),dailyRequests:Number(c['dailyRequests']),maxOutputTokens:Number(c['maxOutputTokens']),timeoutMs:Number(c['timeoutMs']),maxInputChars:Number(c['maxInputChars'])};
  }catch{throw new DomainError('INVALID_PI_CONFIGURATION','Pi 配置无效；检查批准的模型地址、凭据文件和使用上限。');}
}
