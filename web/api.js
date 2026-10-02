let csrf='';
export class ApiError extends Error {constructor(code){super(code);this.code=code;}}
export function setCsrf(value){csrf=value??'';}
export async function api(path,{method='GET',body}={}) {
  let response;
  try{response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(method==='GET'?{}:{'X-Hexu-CSRF':csrf})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});}catch{throw new ApiError('NETWORK');}
  let data;try{data=await response.json();}catch{throw new ApiError('INVALID_RESPONSE');}
  if(!response.ok)throw new ApiError(data.error??'INTERNAL_ERROR');return data;
}
export function errorMessage(error){return ({UNAUTHENTICATED:'登录已失效或用户名、密码不正确，请重新登录。',FORBIDDEN:'你已无权访问此项目或任务。',CSRF:'页面凭证已失效，请刷新后重试。',CONFLICT:'内容已被其他成员更新。你的输入已保留，请刷新核对后重新提交。',INVALID_INPUT:'请检查填写内容。',ACCOUNT_NOT_FOUND:'未找到此账号，请先由管理员创建。',OWNER_REQUIRED:'不能移除或降低项目负责人的权限。',PROJECT_OWNER_REQUIRED:'只有项目负责人可以管理成员。',EXECUTION_FORBIDDEN:'你没有执行或取消权限。',REVIEW_FORBIDDEN:'只有指定验收负责人可以验收。',INVALID_TASK_STATE:'任务阶段已变化，请刷新查看。',RATE_LIMITED:'登录尝试过多，请稍后再试。',NETWORK:'连接失败，输入已保留。请检查网络后重试。',PI_NOT_READY:'Pi 尚未接入，当前只保存成员评论。',ENVIRONMENT_NOT_READY:'开发环境尚未接入，未启动执行。'})[error.code]??'操作未完成，请刷新核对后重试。';}
