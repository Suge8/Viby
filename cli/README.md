# Viby CLI

`cli/` 提供 Viby 的本机 runtime 能力。

它负责 provider 适配、runner、认证、诊断、MCP bridge，以及由 hub 在内部拉起的 agent session 实现。

## 它负责什么

- 启动 `viby hub`
- 托管 `Claude Code`、`Codex`、`Pi` 等 provider runtime
- 作为 runner-managed session stop tracking 的唯一 owner，直到本地子进程真实退出前不提前丢失跟踪
- 作为 `Pi` 新建会话模型与思考强度解析的 machine-side owner
- 提供认证和诊断命令
- 提供 MCP bridge
- 把本机 session 接到 hub，供 Web / Desktop 远程控制

## 常用命令

```bash
viby hub
viby hub --relay
viby mcp
viby auth login
viby auth status
viby doctor
viby runner status
```

## 产品边界

- 会话创建的产品入口在 `web/` 和 `desktop/`
- CLI 负责 runtime 和 provider，不负责维护另一套 Web 产品状态
- session / transcript / recovery 的真相源仍然在 `hub`

## 开发命令

```bash
bun run build:cli
bun run build:single-exe
```

## 继续阅读

- 仓库入口：`README.md`
- 系统架构：`../docs/architecture/system-overview.md`
- 实时恢复：`../docs/architecture/realtime-recovery.md`
