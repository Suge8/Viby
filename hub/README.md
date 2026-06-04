# Viby Hub / AppCore

`hub/` 是 Desktop AppCore 的控制面模块。

它提供本机 HTTP API、Socket.IO realtime、SQLite 持久化、同步链路、远程配对和会话生命周期。发布产品不暴露 `hub` 命令；Desktop 启动 AppCore，AppCore 直接加载本模块。

## 产品边界

- Desktop 是唯一用户入口。
- AppCore 托管 Hub 控制面。
- Hub 负责连接、数据和同步，不负责前端交互呈现。
- Provider runtime 仍处于迁移期，入口只允许 AppCore 内部调用。

## 开发入口

```bash
bun run dev:desktop
```

Hub 单模块调试只用于开发：

```bash
cd hub
bun run dev
```

普通用户不需要命令、不需要环境变量、不需要理解 Hub / daemon / 命令行。私有 broker 调试看 `../docs/development/runtime-environment.md`。

## 继续阅读

- 仓库入口：`../README.md`
- 系统架构：`../docs/architecture/system-overview.md`
- 实时恢复：`../docs/architecture/realtime-recovery.md`
- Hub owner 约束：`../docs/development/hub-owners.md`
- 运行环境变量：`../docs/development/runtime-environment.md`
