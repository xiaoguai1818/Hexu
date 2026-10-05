import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const accounts=JSON.parse(readFileSync(process.env.HEXU_TEST_ACCOUNTS??'/test-private/accounts.json','utf8'));
async function login(page,name='owner'){await page.goto('/');await page.getByLabel('用户名',{exact:true}).fill(name);await page.getByLabel('密码',{exact:true}).fill(accounts[name]);await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.locator('#workspace-view')).toBeVisible();await page.getByRole('navigation').getByRole('button',{name:'团队试点',exact:true}).click();}
async function create(page,label){const title=label+'-'+Date.now();await page.getByRole('button',{name:'新建任务',exact:true}).click();await page.getByLabel('任务标题').fill(title);await page.getByRole('button',{name:'创建任务',exact:true}).click();await expect(page.locator('#task-title')).toHaveText(title);return title;}
async function ask(page,body){await page.getByLabel('评论与反馈').fill(body);await page.getByRole('button',{name:'请 AI 协助梳理',exact:true}).click();}
test.beforeEach(({page})=>{page.__errors=[];page.on('pageerror',error=>page.__errors.push(String(error)));});
test.afterEach(({page})=>expect(page.__errors).toEqual([]));
test('真实 Pi 回复进入任务，普通成员无需模型配置，任务仍为待开发',async({page},info)=>{
  await login(page,'member');await create(page,'AI需求讨论');await ask(page,'我的需求还不成熟，请先帮我梳理，不要开发。');await expect(page.locator('#comments')).toContainText('测试模型答复',{timeout:15000});await expect(page.locator('#task-stage')).toHaveText('待开发');await expect(page.locator('#queue-task')).toBeDisabled();await expect(page.locator('#task-meta')).toContainText('60 tokens');await expect(page.locator('#task-meta')).toContainText('费用尚未核实');await page.screenshot({path:info.outputPath('pi-discussion.png'),fullPage:true});
  await ask(page,'继续比较验收条件');await expect(page.locator('#comments li.comment')).toHaveCount(4);await expect(page.locator('#task-meta')).toContainText('120 tokens');
});
test('刷新和项目成员接手仍能看到同一任务的 AI 讨论历史',async({page,browser})=>{
  await login(page);const name=await create(page,'共同AI讨论');await ask(page,'需要整理计划');await expect(page.locator('#comments')).toContainText('测试模型答复',{timeout:15000});await page.reload();await page.getByRole('navigation').getByRole('button',{name:'团队试点',exact:true}).click();await page.getByRole('button',{name:new RegExp(name)}).click();await expect(page.locator('#comments')).toContainText('需要整理计划');
  const context=await browser.newContext({baseURL:process.env.HEXU_TEST_URL});try{const member=await context.newPage();await login(member,'member');await member.getByRole('button',{name:new RegExp(name)}).click();await expect(member.locator('#comments')).toContainText('测试模型答复');}finally{await context.close();}
});
test('取消实际 Pi 等待，不新增虚假回复，之后可以继续提问',async({page})=>{
  await login(page);await create(page,'取消讨论');await ask(page,'[SLOW] 请等补充信息');await expect(page.locator('#discussion-status')).toContainText('正在梳理');await page.getByRole('button',{name:'请求取消',exact:true}).click();await expect(page.locator('#discussion-status')).toContainText('已取消',{timeout:15000});await expect(page.locator('#comments li.comment')).toHaveCount(1);await expect(page.locator('#ask-ai')).toBeEnabled();
});
test('模型失败不泄露错误或密钥，不把未知消耗显示成免费',async({page})=>{
  await login(page);await create(page,'失败讨论');await ask(page,'[FAIL] 需要梳理');await expect(page.locator('#discussion-status')).toContainText('未成功完成',{timeout:15000});await expect(page.locator('#comments li.comment')).toHaveCount(1);await expect(page.locator('#task-dialog')).not.toContainText('PRIVATE-UPSTREAM-SECRET');await expect(page.locator('#task-meta')).toContainText('不代表零费用');
});
test('讨论运行期间的草稿不被状态刷新清空，也不会被当成开发指令',async({page})=>{
  await login(page);await create(page,'讨论草稿');await ask(page,'[SLOW] 尚未确认');await expect(page.locator('#discussion-status')).toContainText('正在梳理');await page.getByLabel('评论与反馈').fill('还没有提交的补充');await expect(page.locator('#discussion-status')).toContainText('超过本次时间上限',{timeout:15000});await expect(page.getByLabel('评论与反馈')).toHaveValue('还没有提交的补充');await expect(page.locator('#task-stage')).toHaveText('待开发');await expect(page.locator('#queue-task')).toBeDisabled();
});
