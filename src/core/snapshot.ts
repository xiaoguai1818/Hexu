import {DomainError} from './errors.ts';
import {stagePlan} from './stage-plan.ts';
import {normalizeResult} from './result.ts';
import type {Task, Comment, Run} from './task.ts';

const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const timestamp=(v:unknown):v is string=>text(v)&&Number.isFinite(Date.parse(v));
const id=(v:unknown):v is string=>text(v)&&v.length<=128&&/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(v);
function ensure(condition:unknown):asserts condition {if(!condition) throw new DomainError('CORRUPT_SNAPSHOT');}
function comment(value:unknown):asserts value is Comment {
  ensure(object(value)&&id(value['id'])&&id(value['authorId'])&&typeof value['authorKind']==='string'&&['human','ai'].includes(value['authorKind'])&&text(value['body'])&&text(value['at']));
}
function run(value:unknown,version:number):asserts value is Run {
  ensure(object(value)&&id(value['id'])&&id(value['requestedBy'])&&text(value['createdAt']));
  ensure(value['kind']==='discussion'||value['kind']==='development');
  ensure(typeof value['status']==='string'&&['queued','running','cancel_requested','completed','failed','interrupted','canceled'].includes(value['status']));
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
  const status=value['status'];
  if(value['startedAt']!==undefined) ensure(timestamp(value['startedAt']));
  if(status==='queued') ensure(value['startedAt']===undefined);
  if(['running','cancel_requested','completed','interrupted'].includes(String(status))) ensure(timestamp(value['startedAt']));
  if(['completed','failed','interrupted','canceled'].includes(String(status))) ensure(timestamp(value['finishedAt']));
  else ensure(value['finishedAt']===undefined);
  if(status==='failed'||status==='interrupted') ensure(text(value['reason']));
  if(status==='completed') {
    ensure(object(value['result']));
    normalizeResult(value['kind'],value['result'] as Run['result'] & {});
  } else ensure(value['result']===undefined);
}

/** Validate data read from storage; corrupt snapshots never become trusted state. */
export function assertTaskSnapshot(value:unknown):asserts value is Task {
  try {
    ensure(object(value)&&id(value['id'])&&id(value['projectId'])&&id(value['reviewerId'])&&text(value['title']));
    ensure(Number.isSafeInteger(value['version'])&&Number(value['version'])>0);
    ensure(typeof value['state']==='string'&&['discussing','queued','developing','review','done','blocked','canceled'].includes(value['state']));
    ensure(Array.isArray(value['comments'])&&Array.isArray(value['runs'])&&Array.isArray(value['events']));
    value['comments'].forEach(comment);
    for(const item of value['runs']) run(item,Number(value['version']));
    for(const event of value['events']) ensure(object(event)&&text(event['type'])&&id(event['actorId'])&&text(event['at'])&&id(event['reference']));
    const runs=value['runs'] as Run[];
    ensure(new Set(runs.map(r=>r.id)).size===runs.length);
    ensure(new Set((value['comments'] as Comment[]).map(c=>c.id)).size===value['comments'].length);
    const active=runs.filter(r=>['queued','running','cancel_requested'].includes(r.status));ensure(active.length<=1);
    const latest=runs.at(-1);
    if(active[0]) {
      ensure(active[0]===latest);
      ensure(value['state']===(active[0].kind==='discussion'?'discussing':active[0].status==='queued'?'queued':'developing'));
    }
    if(value['state']==='queued'||value['state']==='developing') ensure(active.length===1);
    if(value['state']==='review'||value['state']==='done') {
      ensure(latest?.kind==='development'&&latest.status==='completed');
      if(value['state']==='done') {
        const events=value['events'] as Task['events'],comments=value['comments'] as Comment[];
        let delivered=-1,accepted=-1;
        for(let i=0;i<events.length;i++) {
          const event=events[i]!;
          if(event.type==='run.completed'&&event.reference===latest.id) delivered=i;
          if(event.type==='review.accept'&&event.actorId===value['reviewerId']&&comments.some(c=>c.id===event.reference&&c.authorKind==='human'&&c.authorId===event.actorId)) accepted=i;
        }
        ensure(delivered>=0&&accepted>delivered);
      }
    }
    if(value['state']==='blocked') ensure(latest?.kind==='development'&&['failed','interrupted'].includes(latest.status));
    if(value['state']==='canceled') ensure(latest?.kind==='development'&&latest.status==='canceled');
  } catch {throw new DomainError('CORRUPT_SNAPSHOT');}
}
