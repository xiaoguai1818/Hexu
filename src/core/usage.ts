import {DomainError,requireText} from './errors.ts';

export type RunUsage = {status:'not_reported'} | {
  status:'reported'; inputTokens:number; outputTokens:number;
  cacheReadTokens:number; cacheWriteTokens:number; costStatus:'not_reported';
};
export interface RunModel {provider:string;model:string;version:string}
export function normalizeModel(value:RunModel):RunModel {
  if(!value||Object.keys(value).some(k=>!['provider','model','version'].includes(k)))throw new DomainError('INVALID_INPUT');
  return {provider:requireText(value.provider,'provider',100),model:requireText(value.model,'model',200),version:requireText(value.version,'Pi version',40)};
}
export function normalizeUsage(value:unknown):RunUsage {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new DomainError('INVALID_INPUT');
  const v=value as Record<string,unknown>;
  if(v['status']==='not_reported'&&Object.keys(v).length===1)return {status:'not_reported'};
  const names=['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens'] as const;
  if(v['status']!=='reported'||v['costStatus']!=='not_reported'||Object.keys(v).some(k=>!['status','costStatus',...names].includes(k)))throw new DomainError('INVALID_INPUT');
  for(const name of names)if(!Number.isSafeInteger(v[name])||Number(v[name])<0)throw new DomainError('INVALID_INPUT');
  return {status:'reported',inputTokens:Number(v['inputTokens']),outputTokens:Number(v['outputTokens']),cacheReadTokens:Number(v['cacheReadTokens']),cacheWriteTokens:Number(v['cacheWriteTokens']),costStatus:'not_reported'};
}
