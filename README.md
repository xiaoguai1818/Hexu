# Hexu · 合序

[![Hexu CI](https://github.com/xiaoguai1818/Hexu/actions/workflows/ci.yml/badge.svg)](https://github.com/xiaoguai1818/Hexu/actions/workflows/ci.yml)

企业任务型 AI 协作开发项目。业务定义只在 [docs/product.md](docs/product.md) 维护。

## 当前入口

- [Web 预览启动与账号配置](docs/web.md)
- [实际进展与验证边界](docs/status.md)
- [交付验收](docs/acceptance.md)
- [来源与本轮取舍](docs/source-notes.md)

本目录独立于原 Relayboard。现有 Web 协作预览连接真实账号、项目、成员和任务数据；Pi 与开发环境尚未接入，不是已经具备 AI 开发能力的完整产品。

## 自动检查

自动检查包括双架构核心回归、数据故障与部署恢复，以及正式 Web 入口的 Chromium／Firefox 操作与重启测试；保留变异防回归和安全检查，任一必检层失败、跳过或取消都不能通过汇总门禁。报告保留14天；具体范围与命令见 [测试说明](docs/testing.md)，实际运行结果见 [当前进展](docs/status.md)。

Web 操作通过不等于完整产品验收。真实 Pi、Host、模型选择和费用仍待接入；手动产品验收门禁会明确报告这些阻塞，不把合成交付样本称为真实 AI 开发。

需要本地复现时运行同一入口：

```sh
docker compose run --build --rm check
```

依赖由 npm 清单和锁文件安装；源代码无需携带 node_modules。此检查不使用真实密钥、不运行真实模型，也不接触原项目目录。
