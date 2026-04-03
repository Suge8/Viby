# Viby Hub

`hub/` 是 Viby 的控制面。

它负责 API、Socket.IO、SQLite、消息同步、session lifecycle，以及由本机 runner 支撑的远程会话能力。

## 它负责什么

- 提供 Web / PWA 使用的 HTTP API
- 提供 Socket.IO realtime
- 持久化 session、message、machine 和 team 数据
- 承接 CLI / runner 上报的状态与消息
- 提供远程创建会话、文件、终端和推送能力
- 把目录感知的 agent launch config 请求路由到对应 machine owner
- 作为 manager teams lifecycle 的 authoritative owner

## 产品边界

- `hub` 是控制面，不是 UI
- `hub` 是 durable truth source，不在 Web 本地并行维护第二套事实
- transport recovery 不是业务恢复；业务恢复继续走 snapshot + catch-up

## 开发命令

```bash
bun run dev:hub
```

或从产品入口运行：

```bash
viby hub
viby hub --relay
```

## 继续阅读

- 仓库入口：`README.md`
- 系统架构：`../docs/architecture/system-overview.md`
- 实时恢复：`../docs/architecture/realtime-recovery.md`
- Hub owner 约束：`../docs/development/hub-owners.md`
