import {DomainError} from './errors.ts';
import {stagePlan} from './stage-plan.ts';
import {normalizeResult} from './result.ts';
import type {Task, Comment, Run} from './task.ts';

const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const id=(v:unknown):v is string=>text(v)&&v.length<=128&&/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(v);
function ensure(condition:unknown):asserts condition {if(!condition) throw new DomainError('CORRUPT_SNAPSHOT');}
function comment(value:unknown):asserts value is Comment {
  ensure(object(value)&&id(value['id'])&&id(value['authorId'])&&['human','ai'].includes(String(value['authorKind']))&&text(value['body'])&&text(value['at']));
}
function run(value:unknown,version:number):asserts value is Run {
  ensure(object(value)&&id(value['id'])&&id(value['requestedBy'])&&text(value['createdAt']));
  ensure(value['kind']==='discussion'||value['kind']==='development');
  ensure(['queued','running','cancel_requested','completed','failed','interrupted','canceled'].includes(String(value['status'])));
  ensure(Number.isSafeInteger(value['inputVersion'])&&Number(value['inputVersion'])>0&&Number(value['inputVersion'])<=version);
  ensure(object(value['plan'])&&object(value['plan']['target']));
  const plan=value['plan'],target=plan['target'] as Record<string,unknown>;
  const expected=stagePlan(value['kind'],target['environmentId'] as string|undefined);
  ensure(plan['engine']===expected.engine&&plan['stage']===expected.stage&&plan['role']===expected.role);
  ensure(JSON.stringify(plan['skills'])===JSON.stringify(expected.skills)&&JSON.stringify(plan['capabilities'])===JSON.stringify(expected.capabilities));
  ensure(target['kind']===expected.target.kind);
  ensure(object(value['input']));const input=value['input'];
  ensure(text(input['title'])&&Array.isArray(input['comments'])&&Array.isArray(input['priorDeliveries']));
  input['comments'].forEach(comment);
  ensure(value['kind']==='discussion'?input['scope']===null:text(input['scope']));
  for(const previous of input['priorDeliveries']) normalizeResult('development',previous);
  ensure(object(value['usage'])&&value['usage']['status']==='not_reported');
  if(value['status']==='completed') ensure(object(value['result']));
  if(value['result']!==undefined) normalizeResult(value['kind'],value['result'] as Run['result'] & {});
}

/** Validate data read from storage; corrupt snapshots never become trusted state. */
export function assertTaskSnapshot(value:unknown):asserts value is Task {
  try {
    ensure(object(value)&&id(value['id'])&&id(value['projectId'])&&id(value['reviewerId'])&&text(value['title']));
    ensure(Number.isSafeInteger(value['version'])&&Number(value['version'])>0);
    ensure(['discussing','queued','developing','review','done','blocked','canceled'].includes(String(value['state'])));
    ensure(Array.isArray(value['comments'])&&Array.isArray(value['runs'])&&Array.isArray(value['events']));
    value['comments'].forEach(comment);
    for(const item of value['runs']) run(item,Number(value['version']));
    for(const event of value['events']) ensure(object(event)&&text(event['type'])&&id(event['actorId'])&&text(event['at'])&&id(event['reference']));
    const runs=value['runs'] as Run[];
    ensure(new Set(runs.map(r=>r.id)).size===runs.length);
    const active=runs.filter(r=>['queued','running','cancel_requested'].includes(r.status));ensure(active.length<=1);
    if(active[0]) ensure(value['state']===(active[0].kind==='discussion'?'discussing':active[0].status==='queued'?'queued':'developing'));
  } catch {throw new DomainError('CORRUPT_SNAPSHOT');}
}
