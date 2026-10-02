export const stages=[['discussing','待开发'],['queued','待执行'],['developing','开发中'],['review','待验收'],['done','已完成']];
export const stageName=state=>Object.fromEntries([...stages,['blocked','已阻塞'],['canceled','已取消']])[state]??state;
export function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
export function renderBoard(root,tasks,openTask){
  root.replaceChildren();const columns=[...stages];for(const state of ['blocked','canceled'])if(tasks.some(t=>t.state===state))columns.push([state,stageName(state)]);
  for(const [state,label] of columns){
    const section=element('section',undefined,'column');section.setAttribute('aria-label',label);
    const matches=tasks.filter(t=>t.state===state),heading=element('h2',label);heading.append(element('span',String(matches.length),'count'));section.append(heading);
    if(!matches.length)section.append(element('p',state==='discussing'?'新想法从这里开始':'暂无任务','empty'));
    for(const task of matches){const button=element('button',undefined,'task-card');button.append(element('span',task.title,'card-title'),element('small',`${task.comments.length} 条讨论 · ${task.runs.length} 次运行`));button.addEventListener('click',()=>openTask(task.id));section.append(button);}
    root.append(section);
  }
}
export function renderTask(view,project,user){
  const {task,permissions}=view;document.querySelector('#task-title').textContent=task.title;document.querySelector('#task-stage').textContent=stageName(task.state);
  const comments=document.querySelector('#comments');comments.replaceChildren();
  const names=new Map(project.members.map(m=>[m.id,m.username]));
  for(const comment of task.comments){const item=element('li',undefined,'comment');const who=comment.authorKind==='ai'?'Pi':names.get(comment.authorId)??'原项目成员';item.append(element('strong',who),element('time',new Date(comment.at).toLocaleString('zh-CN')),element('p',comment.body));comments.append(item);}
  if(!task.comments.length)comments.append(element('li','还没有讨论。写下问题和背景，让同伴参与。','empty'));
  const panel=document.querySelector('#delivery');panel.replaceChildren();
  const delivered=task.runs.filter(r=>r.kind==='development'&&r.status==='completed'&&r.result).at(-1);
  if(delivered){const result=delivered.result;panel.append(element('p',result.summary),element('h4','验证记录'),element('p',result.verification));
    for(const artifact of result.artifacts??[]){const p=element('p');p.append(element('strong',artifact.name),element('code',artifact.reference));panel.append(p);}
    for(const issue of result.unresolved??[])panel.append(element('p',`未解决：${issue}`,'error'));
  }else panel.append(element('p','尚无开发交付。任务讨论不会自动修改代码。','muted'));
  const meta=document.querySelector('#task-meta');meta.replaceChildren();for(const [key,value]of [['验收负责人',names.get(task.reviewerId)??'原项目成员'],['当前版本',String(task.version)],['AI 用量','尚未报告（不代表零费用）']])meta.append(element('dt',key),element('dd',value));
  const review=document.querySelector('#review-label');review.hidden=!(task.state==='review'&&permissions.canReview);if(review.hidden)document.querySelector('[name=intent]').value='comment';
  document.querySelector('#cancel-task').hidden=!(permissions.canExecute&&task.runs.some(r=>['queued','running','cancel_requested'].includes(r.status)));
}
