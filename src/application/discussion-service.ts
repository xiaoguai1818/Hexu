import {DomainError} from '../core/errors.ts';
import {normalizeModel} from '../core/usage.ts';
import type {Task,Run} from '../core/task.ts';
import type {TaskRepository} from '../ports/task-repository.ts';
import type {MembershipDirectory} from '../ports/membership-directory.ts';
import type {DiscussionRuntime,DiscussionBudget} from '../ports/discussion-runtime.ts';
import type {TaskService} from './task-service.ts';
import type {RunService} from './run-service.ts';

type Options={tasks:TaskRepository;app:TaskService;runs:RunService;members:MembershipDirectory;runtime:DiscussionRuntime;budget:DiscussionBudget;maxConcurrent:number;dailyLimit:number;timeoutMs:number;now:()=>string};
type Pending={taskId:string;runId:string;actorId:string;projectId:string;controller:AbortController;reason:string;done:Promise<void>};
/** One owner per data directory, enforced by the bootstrap's exclusive store lock.
 * Completion persists a fresh aggregate, so comments arriving in flight are not overwritten.
 */
export class DiscussionService {
  private readonly options:Options;
  private readonly pending=new Map<string,Pending>();
  private stopped=false;
  constructor(options:Options){
    for(const [value,max] of [[options.maxConcurrent,16],[options.dailyLimit,10000],[options.timeoutMs,300000]])if(!Number.isSafeInteger(value)||value!<1||value!>max!)throw new DomainError('INVALID_INPUT');
    normalizeModel(options.runtime.identity);this.options=options;
  }
  get activeCount(){return this.pending.size;}
  get available(){return !this.stopped;}
  request(actor:string,id:string,version:number,body:string):Task {
    const o=this.options,before=o.app.get(actor,id);
    if(before.version!==version)throw new DomainError('CONFLICT');
    if(this.stopped)throw new DomainError('PI_NOT_READY');
    if(this.pending.size>=o.maxConcurrent)throw new DomainError('DISCUSSION_BUSY');
    const admission=`${id}:${version}`;
    o.budget.admit(before.projectId,admission,o.now().slice(0,10),o.dailyLimit);
    let task:Task;
    try{task=o.app.discuss(actor,id,version,body);}catch(error){o.budget.release(admission);throw error;}
    const run=task.runs.at(-1)!;
    const job:Pending={taskId:id,runId:run.id,actorId:actor,projectId:task.projectId,controller:new AbortController(),reason:'',done:Promise.resolve()};
    this.pending.set(run.id,job);job.done=this.execute(job,run);
    // Starting the runtime advances the aggregate synchronously; never return its stale queued version.
    return o.app.get(actor,id);
  }
  private abort(job:Pending,reason:string){if(!job.reason){job.reason=reason;job.controller.abort();}}
  recheck():void {
    for(const job of this.pending.values()){
      try{
        if(!this.options.members.lookup(job.projectId,job.actorId))this.abort(job,'项目访问已撤销，本次讨论停止。');
        const run=this.options.tasks.get(job.taskId)?.runs.find(r=>r.id===job.runId);
        if(run?.status==='cancel_requested')this.abort(job,'已请求取消；本地停止不代表上游费用已经结清。');
      }catch{this.stopped=true;this.abort(job,'任务记录暂不可用，本次讨论中断。');}
    }
  }
  private commit(operation:()=>Task):Task {
    for(let attempt=0;;attempt++)try{return operation();}catch(error){
      if(!(error instanceof DomainError&&error.code==='CONFLICT'&&attempt<4))throw error;
    }
  }
  private async execute(job:Pending,run:Run):Promise<void> {
    const o=this.options,check=setInterval(()=>this.recheck(),100);
    const deadline=setTimeout(()=>this.abort(job,'讨论超过本次时间上限，未自动重试；费用待核对。'),o.timeoutMs);
    try{
      this.recheck();if(job.controller.signal.aborted)throw new Error('aborted before launch');
      this.commit(()=>o.runs.start(job.taskId,job.runId,o.runtime.identity));
      const result=await o.runtime.respond(structuredClone(run.input),job.controller.signal);
      this.recheck();
      this.commit(()=>o.runs.reportUsage(job.taskId,job.runId,result.usage));
      if(job.controller.signal.aborted)throw new Error('aborted');
      this.commit(()=>o.runs.finish(job.taskId,job.runId,{text:result.text}));
    }catch{
      try{
        const current=o.tasks.get(job.taskId)?.runs.find(r=>r.id===job.runId);
        if(current?.status==='cancel_requested')this.commit(()=>o.runs.acknowledgeCancel(job.taskId,job.runId));
        else if(current?.status==='running'&&job.reason)this.commit(()=>o.runs.interrupt(job.taskId,job.runId,job.reason));
        else if(current&&['queued','running'].includes(current.status))this.commit(()=>o.runs.fail(job.taskId,job.runId,'AI 讨论未成功完成，未自动重试；可能已有消耗，费用待核对。'));
      }catch{this.stopped=true;}
    }finally{clearInterval(check);clearTimeout(deadline);this.pending.delete(job.runId);}
  }
  /** Called only after taking exclusive ownership. Never resend an uncertain model call. */
  recover(tasks:Task[]):void {
    for(const task of tasks)for(const run of task.runs){
      if(run.kind!=='discussion'||this.pending.has(run.id))continue;
      if(run.status==='queued')this.options.runs.fail(task.id,run.id,'服务重启，本次排队未继续；请确认后重新提问。');
      else if(['running','cancel_requested'].includes(run.status))this.options.runs.interrupt(task.id,run.id,'服务曾中断，结果与用量可能不完整；没有自动重放。');
    }
  }
  async idle():Promise<void>{await Promise.all([...this.pending.values()].map(j=>j.done));}
  async shutdown():Promise<void>{this.stopped=true;for(const j of this.pending.values())this.abort(j,'服务正在停止，本次讨论中断；费用待核对。');await this.idle();}
}
