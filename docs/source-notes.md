# 来源与取舍

用户于 2026-10-01 确认使用 Hexu，并批准在 /Users/leobot/Projects/Hexu 启动新版开发。原 Relayboard 保留，不复制其业务实现、依赖、运行数据或密钥。

业务和验收由原项目最新两份文档迁入；文件指纹见 provenance.json。product.md 是 Hexu 的唯一业务规则；原项目材料是历史来源，不再作为 Hexu 的另一个可变规则源。

初始实现取舍：先实现任务业务核心、成员权限边界、讨论/开发两种 Pi 工作计划和持久化接口，不导入旧的大型入口文件。不整体采用 Dashi、Octop 或 Paperclip，不预设技术平台迁移。

后续完成情况只看 [status.md](status.md)，本文件不重复维护功能进度。工作计划与技能说明本身不是已生效的操作系统隔离。

临时最小授权：所有有效项目成员可以查看和评论；执行须有明确 canExecute 授权，验收须为指定验收人。应用层的身份/成员目录由可信服务提供，不能直接信任浏览器提交的角色。生产权限配置仍待业务确认。

验证资料：Node.js TypeScript 与 SQLite 官方接口参考分别为 https://nodejs.org/docs/latest-v22.x/api/typescript.html 和 https://nodejs.org/download/release/v22.16.0/docs/api/sqlite.html 。Pi SDK/进程协议尚未在本批接入，不声明真实模型结果。

<a id="pi-herdr-agents"></a>
## 2026-10-05｜pi-herdr-agents 候选收录

**结论：收录为专家团队能力来源，尚未安装、启用或选定为必需运行依赖。** 用户确认的是降低团队工作编排门槛的产品方向，业务规则只在 [B11](product.md#b11)；验收为 [A23–A26](acceptance.md)。不因收录暂停当前 Pi 讨论/开发闭环建设，也不改成另一套平台。

### 来源基线与核实范围

- 对应仓库：[giuseppecrj/pi-herdr-agents](https://github.com/giuseppecrj/pi-herdr-agents)。[package.json](https://github.com/giuseppecrj/pi-herdr-agents/blob/ada60185600383a207bb2a24e43d9b66b9ed8288/package.json) 的包名为 `pi-herdr-agents`，声明版本 `2.0.5`、许可 `MIT`；提交为 `ada60185600383a207bb2a24e43d9b66b9ed8288`。这是本次仓库审阅基线，不是已安装版本；未校验 npm 发布包与源码一致性。近名项目及派生包的能力不混入本次评价。
- 已阅读该提交的 [README](https://github.com/giuseppecrj/pi-herdr-agents/blob/ada60185600383a207bb2a24e43d9b66b9ed8288/README.md)、[planner 角色](https://github.com/giuseppecrj/pi-herdr-agents/blob/ada60185600383a207bb2a24e43d9b66b9ed8288/agents/planner.md)、[工作区与生命周期说明](https://github.com/giuseppecrj/pi-herdr-agents/blob/ada60185600383a207bb2a24e43d9b66b9ed8288/docs/worktree-subagents.md) 和 [ADR-0009](https://github.com/giuseppecrj/pi-herdr-agents/blob/ada60185600383a207bb2a24e43d9b66b9ed8288/docs/adr/0009-remove-workflow-subsystem.md)。本轮是静态资料评估，未运行其测试、未审计完整实现，不作稳定性或安全通过结论。

### 已有能力与 Hexu 的取舍

| 上游资料支持的能力 | 借鉴或适配方向 |
| --- | --- |
| Pi 子任务异步派发、独立执行、结果自动返回；协调者仍可与用户沟通 | 用于任务内部协作，不把终端窗格和插件命令交给普通成员管理。 |
| planner、scout、worker、reviewer 等可复用角色及角色包；角色、技能和运行时分开 | 学习角色职责与交付约定；团队方法由多个角色和检查步骤组成，不把工作流程误作单个专家。 |
| `/plan`、`orchestrate` 等命令/技能组合角色，按职责选择合适模型 | 从受控的少量团队方法起步；不直接暴露上游全部命令，也不继承其模型配置覆盖 Hexu 策略。 |
| 独立写入任务可用 worktree；结果带基准、变更与工作区状态；协调者负责集成 | 可作代码交付适配候选，仍需实测人工修改保护、合并后检查与任务证据关联。 |

### 接入前必须核实的限制

1. 当前版本的 ADR-0009 已移除 `herdr_workflow`、专用 Worker 和 runner journal，保留公开角色/技能编排。不能把它描述为现成的可恢复企业工作流引擎，也不能照旧文档接入已删除接口。工作区文档仍有旧 approved-runner 描述，与该 ADR 不一致，实际边界须按选定源码验证。
2. 该版本说明要求在 Herdr 内运行 Pi。它不是现成的 Hexu Web/远程 Host 协议；worktree 只隔离 Git 工作副本，子进程沿用运行账号权限，`read,bash` 也不等于强制只读。普通员工不安装 Herdr；是否在后台采用它，须在批准环境内验证。
3. 工作区保留不等于可靠恢复：文档明确完整进程重启后不自动恢复 watcher。团队级取消、归属校验、预算汇总和故障恢复不可仅依赖插件会话状态。
4. planner 会写计划文件且允许临时实验，不宜原样当成 Hexu 的纯讨论权限；`visual-tester` 还需要额外 `chrome-cdp` 技能。上游角色认可或宣称验证成功不代替本项目现有 CI 和人类验收。

### 首轮方法建议（非已交付功能）

| 候选方法 | 角色组合与用户得到的结果 |
| --- | --- |
| 需求梳理 | 分析/规划＋必要的现状调查，给出可确认的目标、范围、问题与验收要求。 |
| 功能交付 | 已获授权后按需安排设计、开发、测试、独立审查，形成一次任务交付总结。 |
| 问题诊断 | 复现信息整理、定位、方案比较；未授权时止于建议，修复和设备动作另遵循任务阶段。 |

先复用专业方法，再验证插件适配；有必要才引入运行依赖。不强制每个任务跑全部角色，不把增加 Agent 数量当成质量提升证据。是否具备上述能力只由后续实际测试决定。
