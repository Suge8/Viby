# AppCore Runtime Guide

## 先看这里

- 入口先看 `app-core/README.md`
- provider runtime / resume 语义先看 `../docs/development/app-core-runtime-boundaries.md`
- 跨 reconnect / catch-up / resume 语义再看 `../docs/architecture/realtime-recovery.md`
- 长任务活动路径先看 `../docs/internal/agent-workflow.md`
- touched scope 在 `src/runtime/` 时，再看 `../docs/development/app-core-runtime-boundaries.md`

## 硬规则

- `app-core/` 是 Desktop AppCore runtime；不发布 npm 包，不新增用户命令。
- AppCore 是本机 runtime 单一 owner；worker / provider child 只做隔离。
- `app-core/` 只负责 provider runtime、本机执行、worker、认证、诊断、MCP bridge，不维护第二套 Web 产品状态。
- provider session id -> durable resume token 只认 `session.onSessionFound()` -> Hub metadata ack 这一条链，禁止补第二条 durable token 写回。
- launch 时已经知道 resume handle 的 provider，必须在等待首条 queued user turn 前先走同一条 `session.onSessionFound()` durable ack。
- 低层 scanner / provider callback 只允许暴露 `onDiscoveredSessionId`，并经 `sessionDiscoveryBridge` 收口到 `session.onSessionFound()`。
- agent launch config 只认 AppCore runtime launch config owner，禁止 Web / Hub / AppCore 其他层并行推导默认值。
- AppCore-managed child session bootstrap 的 `apiUrl / runtime token / machineId` 只认 AppCore 注入的 launch identity。
- `internalSessionRuntime` 只允许按目标 agent lazy-load 对应 provider 启动器。
- AppCore-managed session stop tracking 只认 `src/runtime/session/` owner；kill 发出后直到真实退出前不得提前丢 tracking。
- session stop / kill / `SIGINT` / `SIGTERM` 只认同一条 runtime stop owner；不得绕过 provider launcher 的 abort / finally 链直接 cleanup。
- 新主路径稳定后，直接清理旧兼容分支，不保留长期双轨。
- backend durable / lifecycle 路径禁止新增无说明 fire-and-forget；未 await Promise 只能留在显式 orchestration owner。
- 非 provider command / TUI / 诊断 owner 禁止新增 `console.*`。

## 目录索引

- `src/runtime/RuntimeSupervisor.ts`：AppCore supervisor、machine registration、runtime state、child lifecycle。
- `src/runtime/session/`：session spawn、worktree、driver-switch handoff、stop tracking。
- `src/agent/`：session base、driver factory、本机启动策略。
- `src/claude/` `src/codex/` `src/gemini/` `src/opencode/` `src/cursor/` `src/pi/`：provider adapter 与 launcher。
- `src/api/`：provider adapter session client、RuntimeEvent transport、runtime HTTP bootstrap/recovery helpers。
- `src/modules/common/`：共享 RPC、scanner、slash command、uploads。

## 验证基线

- `bun run --cwd app-core typecheck`
- `bun run --cwd app-core test`
