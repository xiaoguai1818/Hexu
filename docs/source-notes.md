# 来源与本轮取舍

用户于 2026-10-01 确认使用 Hexu，并批准在 /Users/leobot/Projects/Hexu 启动新版开发。原 Relayboard 保留，不复制其业务实现、依赖、运行数据或密钥。

业务和验收由原项目最新两份文档迁入；文件指纹见 provenance.json。product.md 是 Hexu 的唯一业务规则；原项目材料是历史来源，不再作为 Hexu 的另一个可变规则源。

本轮先实现可独立检查的任务业务核心、成员权限边界、讨论/开发两种 Pi 工作计划和持久化接口。先写测试，再实现；不导入旧的大型入口文件。不整体采用 Dashi、Octop 或 Paperclip，不预设技术平台迁移。

本批不是完整 Web 产品：登录页面、看板、真实 Pi 运行、共享/专用 Host 接入、费用账本及生产切换仍按验收表逐项实现。工作计划只是交给运行层的契约，不是已生效的操作系统隔离。

临时最小授权：所有有效项目成员可以查看和评论；执行须有明确 canExecute 授权，验收须为指定验收人。应用层的身份/成员目录由可信服务提供，不能直接信任浏览器提交的角色。生产权限配置仍待业务确认。

验证资料：Node.js TypeScript 与 SQLite 官方接口参考分别为 https://nodejs.org/docs/latest-v22.x/api/typescript.html 和 https://nodejs.org/download/release/v22.16.0/docs/api/sqlite.html 。Pi SDK/进程协议尚未在本批接入，不声明真实模型结果。
