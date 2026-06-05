# Viby 仓库指南

## 先读

- 活动路径：`docs/internal/agent-workflow.md`
- 上游决策账本：`docs/internal/update.md`——仅记录 fork 与上游同步决策、审计游标、选择性捡拣事由；日常代码改动不写此文件
- 本地开发命令：`docs/development/local-development.md`
- 仓库边界：`docs/development/repo-boundaries.md`
- 文档分层：`docs/development/documentation-authoring.md`
- 修改范围如果有更近的 `AGENTS.md`，以更近文件为准。
- 如修改与服务端有关，验证后用本机 ssh 部署到服务器，部署完确认无问题；未部署必须明确说明“仅本地完成”，非服务端代码除外。

## 全仓硬规则

- 单一事实源优先，禁止并行维护第二套 owner。
- 根因修复优先，禁止 guard patch、sleep/retry、静默降级。
- 新主路径稳定后，直接迁移并清理旧兼容分支。
- 文档、测试、代码一起更新，禁止漂移。
- 内部账本 `docs/internal/`。
- 文件规模偏好靠人工评审与 agent 约束；不作为默认脚本门禁。

## 目录索引

- `desktop/`：桌面壳、托盘、单实例、AppCore 生命周期托管。
- `hub/`：API、Socket.IO、SQLite、同步链路、会话生命周期。
- `app-core/`：agent runtime、provider adapter、tool surface。
- `web/`：PWA、路由、会话页面、懒加载、Service Worker。
- `pairing/`：公网配对 broker、verify-code / PWA handoff / reconnect、WebSocket signaling、TURN / STUN 配置。
- `shared/`：共享 schema、读模型、协议合同。
- `site/`：`viby.run` 产品官网，静态单页，文案禁内部术语；详见 `site/AGENTS.md`。

## 文档索引

- 总索引：`docs/README.md`
- 系统架构：`docs/architecture/system-overview.md`
- 实时恢复：`docs/architecture/realtime-recovery.md`
- Pairing 架构：`docs/architecture/pairing-broker.md`
- Pairing presence：`docs/architecture/pairing-presence.md`
- 本地开发命令：`docs/development/local-development.md`
- Web 边界：`docs/development/web-boundaries.md`
- Hub 边界：`docs/development/hub-owners.md`
- AppCore 边界：`docs/development/app-core-runtime-boundaries.md`
- Shared 合同：`docs/development/shared-contracts.md`
- 运行环境：`docs/development/runtime-environment.md`
- Pairing 部署：`docs/deployment/pairing-broker.md`
- Pairing 操作：`docs/operations/pairing-mode.md`
- 验证标准：`docs/internal/verification-standards.md`

## 验证基线

- Web 修改范围默认至少跑：
  - `bun run --cwd web typecheck`
  - 对应聚焦测试
  - `bun run --cwd web build`
- Pairing / shared pairing / web remote / desktop bridge / hub resume 修改范围默认额外跑：
  - `bun run test:it-pairing`
  - `bun run typecheck:integration`
  - 对应模块 focused tests / typecheck
  - 终态判定单一拥有者是 `shared/src/pairing/pairingCloseCode.ts`；relay/transport 端点收到 broker 终态 close（`1008` / `1012 replaced` / 任一 `PairingByeReason`）必须停止重连并上报 `onFatal`，禁止无条件 `scheduleReconnect`（否则失效凭证 churn 饿死新扫码，见 `docs/architecture/pairing-integration-tests.md` D11）。
- desktop / hub / app-core 修改范围按对应模块 README 和 docs 执行。
- 验证 / gate / audit / smoke 修改范围额外跑：
  - `bun run verify:required`
  - `bun run test:scripts`
- upstream / fork 审计任务额外先跑：
  - `bun run audit:upstream`
  - 需要刷新远端时跑 `bun run audit:upstream:fetch`
