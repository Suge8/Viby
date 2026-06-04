# AppCore runtime

`app-core/` 是 Desktop App 打包的 AppCore 二进制与 provider runtime 实现，不是用户入口，不发布 npm 包。

## 允许用途

- Provider runtime 实现。
- AppCore 内部 worker / provider child 启动。
- 开发与测试辅助脚本。
- AppCore 二进制构建入口（`viby-app-core`）。

## 禁止用途

- 用户文档入口。
- npm 发布入口。
- 公开命令入口。
- 第二套 session runtime owner。

## 运行链路

```text
Desktop → AppCore → runtime worker → provider child
```

AppCore 是唯一本机 runtime owner；worker / child process 只做隔离，不暴露给用户。

## 继续阅读

- 仓库入口：`../README.md`
- Runtime 边界：`../docs/development/app-core-runtime-boundaries.md`
- 系统架构：`../docs/architecture/system-overview.md`
