import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const credentials=JSON.parse(readFileSync(process.env.HEXU_TEST_ACCOUNTS??'/test-private/accounts.json','utf8'));
const seed=JSON.parse(readFileSync(process.env.HEXU_TEST_SEED??'/test-private/seed.json','utf8'));
async function login(page,name='owner'){
  await page.goto('/');await page.getByLabel('用户名',{exact:true}).fill(name);await page.getByLabel('密码',{exact:true}).fill(credentials[name]);await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.locator('#workspace-view')).toBeVisible();
}
async function task(page,title){await page.getByRole('button',{name:'新建任务',exact:true}).click();const dialog=page.locator('#new-task-dialog');await dialog.getByLabel('任务标题').fill(title);await dialog.getByRole('button',{name:'创建任务',exact:true}).click();await expect(page.locator('#task-title')).toHaveText(title);}
async function open(page,title){await page.getByRole('button',{name:new RegExp(title)}).click();await expect(page.locator('#task-title')).toHaveText(title);}
async function comment(page,text){await page.getByLabel('评论与反馈').fill(text);await page.getByRole('button',{name:'提交反馈',exact:true}).click();await expect(page.locator('#comments')).toContainText(text);}
const title=label=>`${label}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
test.beforeEach(async({page})=>{page.__errors=[];page.on('pageerror',e=>page.__errors.push(String(e)));});
test.afterEach(async({page})=>{expect(page.__errors).toEqual([]);});

test('真实登录、刷新保持会话、退出后不能恢复项目数据',async({page})=>{
  await page.goto('/');await page.getByLabel('用户名',{exact:true}).fill('owner');await page.getByLabel('密码',{exact:true}).fill('wrong');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('alert')).toContainText('不正确');
  await login(page);await page.reload();await expect(page.locator('#workspace-view')).toBeVisible();await page.getByRole('button',{name:'退出登录'}).click();await expect(page.locator('#login-view')).toBeVisible();await page.reload();await expect(page.locator('#workspace-view')).toBeHidden();
});
test('创建真实项目任务、保存讨论、刷新保留，恶意文本不执行',async({page})=>{
  await login(page);await page.getByRole('button',{name:'新建项目',exact:true}).click();const name=title('项目');await page.getByLabel('项目名称').fill(name);await page.getByRole('button',{name:'创建项目',exact:true}).click();await expect(page.locator('#project-name')).toHaveText(name);
  const nameTask=title('需求');await task(page,nameTask);await comment(page,'<img src=x onerror="window.hexuUnsafe=true"> 帮我实现，但先讨论');expect(await page.evaluate(()=>window.hexuUnsafe)).toBeUndefined();await expect(page.locator('#task-stage')).toHaveText('待开发');await expect(page.getByRole('button',{name:'确认并转待执行'})).toBeDisabled();await expect(page.getByRole('button',{name:'请 AI 协助梳理'})).toBeDisabled();
  await page.reload();await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();await open(page,nameTask);await expect(page.locator('#comments')).toContainText('先讨论');await expect(page.locator('#task-meta')).toContainText('不代表零费用');
});
test('同项目的另一成员能看到并接续评论，不能提升为执行者',async({page,browser})=>{
  await login(page);await page.getByRole('navigation').getByRole('button',{name:'团队试点',exact:true}).click();const name=title('共同讨论');await task(page,name);await comment(page,'负责人补充背景');
  const context=await browser.newContext({baseURL:process.env.HEXU_TEST_URL});try{const member=await context.newPage();await login(member,'member');await open(member,name);await expect(member.locator('#comments')).toContainText('负责人补充背景');await comment(member,'成员接续讨论');await page.getByRole('button',{name:'刷新讨论'}).click();await expect(page.locator('#comments')).toContainText('成员接续讨论');await expect(member.locator('#review-label')).toBeHidden();}finally{await context.close();}
});
test('并发编辑拒绝覆盖，保留输入并能刷新后重试',async({page,browser})=>{
  await login(page);await page.getByRole('navigation').getByRole('button',{name:'团队试点',exact:true}).click();const name=title('并发');await task(page,name);
  const context=await browser.newContext({baseURL:process.env.HEXU_TEST_URL});try{const other=await context.newPage();await login(other,'member');await open(other,name);await page.getByLabel('评论与反馈').fill('我的草稿不能丢失');await comment(other,'先提交的意见');await page.getByRole('button',{name:'提交反馈'}).click();await expect(page.locator('#comment-error')).toContainText('输入已保留');await expect(page.getByLabel('评论与反馈')).toHaveValue('我的草稿不能丢失');await page.getByRole('button',{name:'刷新讨论'}).click();await page.getByRole('button',{name:'提交反馈'}).click();await expect(page.locator('#comments')).toContainText('我的草稿不能丢失');await expect(page.locator('#comments')).toContainText('先提交的意见');}finally{await context.close();}
});
test('移除项目成员后，其既有登录也无法再读任务',async({page,browser})=>{
  await login(page);await page.getByRole('button',{name:'新建项目',exact:true}).click();const name=title('撤权');await page.getByLabel('项目名称').fill(name);await page.getByRole('button',{name:'创建项目',exact:true}).click();await expect(page.locator('#project-name')).toHaveText(name);
  await page.locator('#members-panel summary').click();await page.getByLabel('成员用户名').fill('member');await page.getByRole('button',{name:'添加或更新成员'}).click();await expect(page.locator('#members')).toContainText('member');const nameTask=title('私有任务');await task(page,nameTask);await page.getByRole('button',{name:'关闭任务详情'}).click();
  const context=await browser.newContext({baseURL:process.env.HEXU_TEST_URL});try{const member=await context.newPage();await login(member,'member');await member.getByRole('navigation').getByRole('button',{name,exact:true}).click();await open(member,nameTask);await page.getByRole('button',{name:'移除 member'}).click();await expect(page.locator('#members')).not.toContainText('member');await member.getByRole('button',{name:'刷新讨论'}).click();await expect(member.locator('#task-dialog')).not.toBeVisible();await expect(member.locator('#global-message')).toContainText('无权');}finally{await context.close();}
});
test('待验收展示总结，普通完成评论不验收，明确反馈才完成',async({page})=>{
  await login(page);await page.getByRole('navigation').getByRole('button',{name:'团队试点',exact:true}).click();await open(page,'待验收样本');await expect(page.locator('#delivery')).toContainText('合成测试交付');await comment(page,'他说已完成，但还没完成');await expect(page.locator('#task-stage')).toHaveText('待验收');
  await page.getByLabel('本次反馈').selectOption('accept');await comment(page,'我已核对并接受此合成样本');await expect(page.locator('#task-stage')).toHaveText('已完成');await expect(page.locator('#review-label')).toBeHidden();
});
test('返工回讨论，旧交付保留，不自动重新开发',async({page})=>{
  await login(page);await page.getByRole('navigation').getByRole('button',{name:'团队试点',exact:true}).click();await open(page,'返工样本');await page.getByLabel('本次反馈').selectOption('discuss');await comment(page,'新需求还不成熟，先澄清');await expect(page.locator('#task-stage')).toHaveText('待开发');await expect(page.locator('#delivery')).toContainText('合成测试交付');
});
test('窄屏可用，键盘关闭任务后草稿保留，已完成任务评论不重启',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await login(page);await page.getByRole('navigation').getByRole('button',{name:'团队试点',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('mobile-board.png'),fullPage:true});
  await open(page,'完成后评论样本');await page.getByLabel('评论与反馈').fill('下轮再议');await page.keyboard.press('Escape');await open(page,'完成后评论样本');await expect(page.getByLabel('评论与反馈')).toHaveValue('下轮再议');await page.getByRole('button',{name:'提交反馈'}).click();await expect(page.locator('#comments')).toContainText('下轮再议');await expect(page.locator('#task-stage')).toHaveText('已完成');
});
test('非成员不见项目，直接请求任务被后端拒绝',async({page})=>{
  await login(page,'outsider');await expect(page.getByRole('navigation')).not.toContainText('团队试点');const status=await page.evaluate(async id=>(await fetch(`/api/tasks/${id}`)).status,seed.ids['返工样本']);expect(status).toBe(403);
});
