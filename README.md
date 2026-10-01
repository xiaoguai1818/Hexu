# Hexu · 合序

[![Hexu CI](https://github.com/xiaoguai1818/Hexu/actions/workflows/ci.yml/badge.svg)](https://github.com/xiaoguai1818/Hexu/actions/workflows/ci.yml)

企业任务型 AI 协作开发项目。业务定义只在 [docs/product.md](docs/product.md) 维护。

## 当前入口

- [实际进展与验证边界](docs/status.md)
- [交付验收](docs/acceptance.md)
- [来源与本轮取舍](docs/source-notes.md)

本目录独立于原 Relayboard。当前首先建设任务业务核心，不是可直接上线的完整 Web 应用。

## 自动检查

本分支的增强配置包含双架构回归与覆盖率、真实数据库并发/故障、编译核心的隔离部署与恢复、定向变异防回归、依赖与工作流检查，以及失败/跳过不可绕过的汇总门禁。报告保留14天；具体范围与命令见 [测试说明](docs/testing.md)，实际运行结果见 [当前进展](docs/status.md)。

工程检查不等于完整产品验收。Web、真实Pi与Host尚未接入；手动产品验收门禁会明确报告这些阻塞，不将替身测试标为已上线可用。

需要本地复现时运行同一入口：

```sh
docker compose run --build --rm check
```

依赖由 npm 清单和锁文件安装；源代码无需携带 node_modules。此检查不使用真实密钥、不运行真实模型，也不接触原项目目录。
