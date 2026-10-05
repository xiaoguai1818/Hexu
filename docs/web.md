# Web 协作预览：运行与维护

本文件只说明启动、账号和数据管理；功能现状见 [status.md](status.md)，业务定义仍只在 [product.md](product.md)。普通协作镜像不启用 AI；本页的可选配置可接通 Pi 需求讨论，代码开发仍未开放。

## 本机 Docker 预览

在 Hexu 根目录使用独立配置，不复用原项目的服务或数据卷：

```sh
docker compose -f compose.web.yaml build
```

由操作者创建账号。以下命令在当前终端询问用户名和密码，密码不写入命令参数、Git 或日志；Python 3 仅用于安全读取终端输入：

```sh
python3 -c 'import sys,json,getpass; print("用户名：",file=sys.stderr); name=input(); print(json.dumps({"username":name,"password":getpass.getpass("密码（至少12字符）：")}))' | docker compose -f compose.web.yaml run --rm -T app node bin/add-user.mjs

docker compose -f compose.web.yaml up -d --wait
```

在这台电脑浏览器打开 `http://localhost:18810`。端口默认只绑定本机，**此配置不是对外发布方案**。可用 `HEXU_WEB_PORT` 更换端口，并保持浏览器访问地址与配置中的来源一致。

停服：`docker compose -f compose.web.yaml stop`。查看本轮日志：`docker compose -f compose.web.yaml logs app`。不要对需要保留的数据执行 `down --volumes`。

## 可选：由管理员接通 Pi 需求讨论

使用 `compose.web.yaml` 加 `compose.pi.yaml`，仍只绑定本机预览端口。Pi 依赖由独立锁文件 `runners/pi/package-lock.json` 安装，固定 SDK 1.0.3；普通协作镜像不额外携带它。管理员在仓库外的受保护目录准备 `model.json` 和 `key`（原始凭据，只授予运行用户读取权限）：

```json
{
  "schema": 1,
  "model": "管理员批准的模型ID",
  "baseUrl": "https://批准的模型服务/v1",
  "apiKeyFile": "/run/hexu-pi/key",
  "maxConcurrent": 2,
  "dailyRequests": 50,
  "maxOutputTokens": 2048,
  "timeoutMs": 60000,
  "maxInputChars": 32000
}
```

当前只接 OpenAI-compatible Chat Completions 流式接口，需提供准确用量。填入实际批准的模型与地址后，由操作者执行：

```sh
export HEXU_PI_CONFIG_DIR=/仓库外的绝对路径/hexu-pi
docker compose -f compose.web.yaml -f compose.pi.yaml build app
docker compose -f compose.web.yaml -f compose.pi.yaml up -d --wait app
```

不自动发现本机 Pi 设置、插件、用户密钥或项目文件。每轮由同一 Pi SDK 读取已批准的需求技能和任务讨论上下文，不注册文件、Shell、设备或子 Agent 工具；工作线程环境不继承宿主凭据。线程提供故障/堆内存限制，**不是操作系统安全沙箱**。开发环境与专家团队需单独建设，不能通过配置文件启用。

使用上限必须显式配置：并发、项目每日请求数、输入大小、输出上限和超时。请求次数持久保存，失败和不确定调用仍占用次数；只在任务未创建时释放。它们**不是货币预算或账单结算**。当前使用一个指定模型，没有自动模型路由；Pi 的零价格占位不作为实际费用。缺失用量、失败和取消可能产生尚未核实的消耗，页面不得显示免费。

没有配置时保持普通协作模式；配置无效则拒绝启动，不隐式选模型。仅允许一个讨论服务持有同一数据目录，重复启动会失败。进程异常终止后，未完成讨论标记中断，不重发上游请求；用户核对后重新提问。

## 账号和权限的当前实现

没有默认密码、公开注册、密码找回或完整后台账号管理。账号由操作者通过上述入口预置；添加成员时填写已有用户名。密码采用带独立随机盐的 scrypt，登录会话在服务器保存并可登出撤销。生产环境需配置准确的 HTTPS 来源，安全 Cookie 会随之开启；不要以放宽来源校验代替部署配置。

本批临时权限选择：已配置账号可创建项目，创建者为负责人；负责人添加成员或授予执行资格，普通成员可见可评论，不因可见自动获授权。此选择用于小范围验证，不冒称企业最终权限策略已确定。

## 数据与恢复边界

命名卷内同时有 `workspace.sqlite`（账号、项目、成员与会话）和 `tasks.sqlite`（任务与历史），两者及其写入日志都要保留。启用讨论后还包含 `discussion-budget.sqlite`（调用准入记录）和 `discussion-owner.sqlite`（运行所有权），也需随整个卷维护。已有备份函数解决单个 SQLite 文件的一致性，不保证跨两个库的在线快照一致性；本阶段需先停服，再备份整个数据卷，并在独立测试环境验证恢复。

不自动导入 Relayboard，不迁移旧账号、任务或密钥。运行镜像只含编译代码、页面、技能及启动入口，没有测试用户或预置交付结果。

## 浏览器补充实测

GitHub 持续执行两种浏览器和容器化部署测试，详见 [testing.md](testing.md)。本机补充验证可使用同一份浏览器用例，全部测试数据写入临时目录，结束后销毁，不要求安装 Docker：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install playwright install chromium
npm run build
node scripts/local-web-check.mjs
```

此入口启动实际 `bin/server.mjs`，只绑定随机本机端口；报告在被 Git 忽略的 `ci-results/local-browser/`。依赖和浏览器缓存不纳入源码交接。本机检查不能替代 GitHub 正式门禁，也不代表真实 Pi 或硬件验收。

Pi 讨论专项补充验证：先执行 `npm --prefix runners/pi ci --ignore-scripts --no-audit --no-fund` 和 `npm run build`，再执行 `HEXU_BROWSER_SUITE=piBrowser node scripts/local-web-check.mjs`。它使用真实 Pi 与本机合成模型接口，不需要真实 API key；报告在 `ci-results/local-pi-browser/`，不证明实际模型的需求分析质量。
