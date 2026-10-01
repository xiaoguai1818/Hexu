# Hexu · 合序

[![Hexu CI](https://github.com/xiaoguai1818/Hexu/actions/workflows/ci.yml/badge.svg)](https://github.com/xiaoguai1818/Hexu/actions/workflows/ci.yml)

企业任务型 AI 协作开发项目。业务定义只在 [docs/product.md](docs/product.md) 维护。

## 当前入口

- [实际进展与验证边界](docs/status.md)
- [交付验收](docs/acceptance.md)
- [来源与本轮取舍](docs/source-notes.md)

本目录独立于原 Relayboard。当前首先建设任务业务核心，不是可直接上线的完整 Web 应用。

## 自动检查

推送 `main` 或提交 Pull Request 后，[GitHub Actions](https://github.com/xiaoguai1818/Hexu/actions) 自动在 Linux x64、arm64 上运行类型检查、构建及全部核心测试，也支持手动触发。日志保留 7 天；结果以对应提交的 CI 记录为准，不代表真实 Pi 或硬件验收。

需要本地复现时运行同一入口：

```sh
docker compose run --build --rm check
```

依赖由 npm 清单和锁文件安装；源代码无需携带 node_modules。此检查不使用真实密钥、不运行真实模型，也不接触原项目目录。
