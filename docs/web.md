# Web 协作预览：运行与维护

本文件只说明启动、账号和数据管理；功能现状见 [status.md](status.md)，业务定义仍只在 [product.md](product.md)。当前不是已经接通 AI 的完整开发平台。

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

## 账号和权限的当前实现

没有默认密码、公开注册、密码找回或完整后台账号管理。账号由操作者通过上述入口预置；添加成员时填写已有用户名。密码采用带独立随机盐的 scrypt，登录会话在服务器保存并可登出撤销。生产环境需配置准确的 HTTPS 来源，安全 Cookie 会随之开启；不要以放宽来源校验代替部署配置。

本批临时权限选择：已配置账号可创建项目，创建者为负责人；负责人添加成员或授予执行资格，普通成员可见可评论，不因可见自动获授权。此选择用于小范围验证，不冒称企业最终权限策略已确定。

## 数据与恢复边界

命名卷内同时有 `workspace.sqlite`（账号、项目、成员与会话）和 `tasks.sqlite`（任务与历史），两者及其写入日志都要保留。已有备份函数解决单个 SQLite 文件的一致性，不保证跨两个库的在线快照一致性；本阶段需先停服，再备份整个数据卷，并在独立测试环境验证恢复。

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
