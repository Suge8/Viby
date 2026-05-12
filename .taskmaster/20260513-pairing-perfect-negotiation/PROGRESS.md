# Progress Log — Pairing Perfect-Negotiation Reconstruction

## Session Start

- **Date**: 2026-05-13 02:54
- **Task name**: `20260513-pairing-perfect-negotiation`
- **Task dir**: `.taskmaster/20260513-pairing-perfect-negotiation/`
- **Spec**: See `EPIC.md`
- **Plan**: See `SUBTASKS.csv` (11 child tasks)
- **Environment**: Bun / TypeScript / Vitest / React 19 / Tauri 2

---

## Context Recovery Block

> Resume from here after compaction / restart.

- **Current milestone**: #4 — Phase D Broker Forwarder
- **Current status**: Phase C DONE；Phase D TODO
- **Last completed**: #3 Phase C Pairing Transport
- **Current artifact**: `shared/src/pairing/pairingTransport.ts`
- **Claimed by**: `none`
- **Lease until**: `none`
- **Write scope**: `none`
- **Handoff**: `none`
- **Key context**: Phase C added shared `createPairingTransport` (177 lines): stable external-store snapshot, `untilReady`, wakeable reconnect backoff, V2 signal socket, and transport-owned ICE restart/foreground hooks. Existing desktop/web legacy restartIce remains for later E/F cleanup per plan.
- **Known issues**: 真机回归矩阵需要 iPhone Safari + 桌面端联调；自动化只是保底。D/E/F 发布必须协调 staging 24h burn-in。
- **Next action**: 取 row 4 (`tasks/04-broker-forwarder`)，forwarder 化 broker；D/E/F 是协调发布单元，Phase D 完成后不得单独 prod 部署。

---

## Epic Planning — 2026-05-13 02:54

- **What was done**:
    - 完成根因调研：`raw/root-cause.md`
    - 完成业界最佳实践调研：`raw/research-notes.md`
    - 写完 `EPIC.md` + `SUBTASKS.csv`
    - 11 phase 依赖图固化
- **Key decisions**:
    - **决策 1**：协议层退到 W3C Perfect Negotiation Pattern；不自创 transportId / ready / peer-left 等业务信号
    - **理由**：MDN Perfect_negotiation 是 W3C 标准；fippo 数据 8.7% 连接需 ICE restart；自创信号是 race 来源
    - **替代方案**：(a) 只修当前 rebuildTransport 路径；(b) 引入 simple-peer。均拒绝：(a) 不解决根因 first-claim 与 reconnect 双路径问题；(b) 引外部依赖违反极简
    - **决策 2**：broker 降到纯 forwarder（仅 token 验 + signal forward + TTL GC）
    - **理由**：所有 race 来自 broker 的业务状态机（markConnected / emitReady / peer-left grace）；perfect negotiation 不需要任何业务语义
    - **决策 3**：RTCPeerConnection 长寿命 / SignalingSocket 短寿命
    - **理由**：Mosh 设计哲学（identity 持久 + transport 易变）；RFC 8831 + Philipp Hancke 数据证实 ICE restart 不破坏 DTLS+SCTP+DataChannel
    - **决策 4**：UI 状态 5 态 → 3 态（`first-pairing | running | fatal`），刷新走 IDB hydrate
    - **理由**：用户报告的"全屏正在连接你的电脑"来自 `booting && !retainedReady`；retainedReady 应该持久化
- **Files changed**:
    - 新建 `EPIC.md`
    - 新建 `SUBTASKS.csv`
    - 新建 `PROGRESS.md`（本文件）
    - 新建 `raw/root-cause.md`
    - 新建 `raw/research-notes.md`
    - 新建 `raw/regression-matrix.md`（template）

---

## Review Fixes — 2026-05-13 03:30

基于二轮调研（MDN Perfect Negotiation 样本 / webrtcHacks/adapter#1084 / fippo ICE restart 文章 / w3c/webrtc-pc#2167 / RFC 8831）发现原计划 11 处需要修复。全部 apply 完成。

- **What was done**:
    - **Fix 1 (高)**——明确 D/E/F 为同一发布单元。broker wire-level 不兼容旧客户端；staging 24h burn-in 是唯一保障。修改：EPIC.md (R1, Collaboration Notes, Constraints)；SUBTASKS.csv (D/E/F 行标题 + notes)；Phase D SPEC 全面重写向后兼容章节。
    - **Fix 2 (中)**——Phase B engine 不用 `setLocalDescription()` 无参（Safari 13.1 bug），改为显式两步 `createOffer/Answer + setLocalDescription(desc)`。修改：Phase B SPEC (Constraints + 骨架示例 + Risk)。
    - **Fix 3 (中)**——Phase C transport handle 加 `untilReady()` API（永不超时的 Promise）。Phase F SPEC 包含 `await session.untilReady()` 使用点。修改：Phase C SPEC TypeScript 契约 + 行为规范 + Acceptance。
    - **Fix 4 (高)**——ICE restart 职责集中到 Phase C transport。Phase B engine 不监听 `iceconnectionstatechange`，不调 `peer.restartIce()`。避免与 transport 层重复触发导致 makingOffer race (w3c/webrtc-pc#2167)。修改：Phase B SPEC + Phase C SPEC。
    - **Fix 5 (高)**——Phase C 加 `notifyForeground()` API（iOS Safari 后台冻结 WebRTC 必要）。Phase F 在 `subscribeForegroundPulse` 接这个 API。修改：EPIC R6；Phase C SPEC (契约 + 行为 + Acceptance + Risk)；Phase F SPEC (RemotePeerSession 骨架)。
    - **Fix 6 (中)**——Phase G IDB hydrate 接受 ≤ 200ms `hydrating` 过渡态（minimal skeleton），严格 0 闪烁不现实。加 `RemotePairingHydrateSkeleton.tsx` ≤ 30 行。修改：Phase G SPEC 全面重写 Hydrate 流程 + UI 表格 + Acceptance + Risk。
    - **Fix 7 (中)**——Phase F 出考保留文件清单：`remotePairingErrors.ts / remotePairingHttp.ts / remotePairingAuthFlow.ts / remotePairingBridgeTypes.ts / RemotePairingController.tsx / remotePairingViewModel.tsx` 保留不动（业务辅助，不在传输栈预算）。明确加 `mapByeToErrorKey` 函数到 errors.ts。修改：Phase F SPEC Constraints。
    - **Fix 8 (中)**——长度护栏全部明确排除 `*.test.ts` / `*.test.tsx` / `__tests__/`。修改：EPIC.md Constraints + Done-When；Phase B/C/E/F/G 各 Acceptance + Validation Command；Phase K count-lines 脚本规格。
    - **Fix 9 (低)**——Phase E + F 加 Step 0（import-audit）：动手前先生成拟删文件的外部依赖报表。修改：Phase E SPEC + Phase F SPEC。
    - **Fix 10 (低)**——Phase D broker session state 收缩为 `active | deleted | expired`。老数据透过 `migrateLegacyState()` in-memory 转换，不动表结构。修改：Phase D SPEC Constraints + Acceptance。
    - **Fix 11 (低)**——Phase B mock RTCPeerConnection 预算明确 ~150-200 行。不引入 `wrtc` / `node-webrtc` 依赖。修改：Phase B SPEC Acceptance + Risk。
- **Files changed**:
    - `EPIC.md`（Constraints + Risk + Collaboration Notes + Done-When）
    - `SUBTASKS.csv`（D/E/F 行多笔）
    - `tasks/02-perfect-negotiation/SPEC.md`
    - `tasks/03-pairing-transport/SPEC.md`
    - `tasks/04-broker-forwarder/SPEC.md`
    - `tasks/05-desktop-bridge/SPEC.md`
    - `tasks/06-web-peer-session/SPEC.md`
    - `tasks/07-ui-state-machine/SPEC.md`
    - `tasks/11-legacy-cleanup/SPEC.md`
- **Validation**: 计划冻结；SUBTASKS.csv 仍合法（8 列以上 11 行）；仹依赖图未变。

## Front-end Coverage Fixes — 2026-05-13 04:10

用户提醒“后后端改动的同时前端要对应上”。grep 全仓 pairing 前端展示点后，发现 7 处原 SPEC 未覆盖，同时代带加 “zustand or not” 调研的结论：不引入，但把 Phase C transport handle 改为 React 19 标准 store 接口 (`subscribe + getSnapshot`)，直接接入 `useSyncExternalStore`。

- **What was done**:
    - **Fix 12 (高)**——Phase C `PairingTransportHandle` 从 `onStateChange callback + getState` 改为 `subscribe + getSnapshot` (React 18+ external store 协议)；PairingTransportState 加 `attempt: number` 字段。符合 stable identity 要求避免 `useSyncExternalStore` infinite render。
    - **Fix 13 (高)**——Phase F SPEC 明确 RemotePeerSession **必须 implement RemotePeerBridge 完整 60+ 方法**；上层 `RemotePairingRuntime.tsx` 调用点不动；session 暴露双订阅接口 (transport state + business event)。
    - **Fix 14 (高)**——Phase E SPEC 明确 `PairingBridgeState.phase` 枚举从 5 态 (`idle/connecting/paused/ready/error`) 收缩到 3 态 (`connecting/ready/fatal`)；列出受影响的 desktop UI 文件。
    - **Fix 15 (中)**——Phase G SPEC 加 `RemoteConnectingPhase` 类型收缩（4 → 3 子态）+ i18n keys 完整清理清单（删 13 keys、保 11+、新增 4）。
    - **Fix 16 (中)**——Phase H SPEC 加 `buildRemoteReconnectNotice` 接口变化（+attempt +onStop） + UI 插入 [停止] 按钮逻辑 + controller useSyncExternalStore 集成。
    - **Fix 17 (中)**——Phase J SPEC 加 desktop popover **状态文案映射表**（phase → dot tone + secondary line）；deviceListPresentation / deviceLinkBadge 同步适配。
    - **Fix 18 (中)**——EPIC.md 加 **前端展示点对应矩阵 F1-F14**，逐项映射到 SPEC 责任；Phase K 加 `scripts/check-pairing-front-end-coverage.mjs` audit 脚本作为验证门。
    - **架构问题**：it 调研后明确**不引入 zustand / jotai / xstate / valtio**。当前状态面：@tanstack/react-query 主力（145 queryKeys, 20 useQuery/Mutation） + 5 个 context (DI 用途) + 41 个文件 useState (密度峰值 4) + 10 个 useSyncExternalStore。复杂性根源是 WebRTC 协议状态机本身，在 React 树之外的 class (PerfectNegotiation 50 行 / transport 200 行)，状态库解决不了。
- **Files changed**:
    - `EPIC.md`（加前端对应矩阵 F1-F14 + 验证门）
    - `tasks/03-pairing-transport/SPEC.md`（subscribe/getSnapshot 接口 + commitState 内部 owner + attempt 计数 + acceptance 补 useSyncExternalStore 验证）
    - `tasks/05-desktop-bridge/SPEC.md`（phase 679a举收缩 + UI 文件同步清单）
    - `tasks/06-web-peer-session/SPEC.md`（RemotePeerSession implements RemotePeerBridge 60+ 方法 + transport.subscribe 接入）
    - `tasks/07-ui-state-machine/SPEC.md`（RemoteConnectingPhase 收缩 + i18n keys 清理清单）
    - `tasks/08-timing-cleanup/SPEC.md`（buildRemoteReconnectNotice 接口 + [停止] 按钮 + controller 集成）
    - `tasks/10-presence-migration/SPEC.md`（popover 状态文案映射表）
    - `tasks/11-legacy-cleanup/SPEC.md`（前端对应 audit 脚本 + harness:check 接入）
- **Validation**: 7 个 SPEC + EPIC 全可读；SUBTASKS.csv 仍合法；EPIC 前端矩阵 F1-F14 全部映射到 SPEC 责任；grep anchor 全部命中。

<!-- 每个 Phase 完成后在此 append entry -->

## Phase A Complete — 2026-05-12T18:15:00Z

- Added `shared/src/pairing/pairingSignal.ts` with V2 `description | candidate | bye` zod contract.
- Added `shared/src/pairing/pairingSignal.test.ts` covering round-trip parse/stringify, all description types, nullable candidate fields, invalid bye reason rejection.
- Exported V2 signal schema from `shared/src/pairing/index.ts`.
- Validation: `bun run --cwd shared typecheck && bun run --cwd shared test -t pairingSignal` ✅
- Real-device RM: not applicable for Phase A.
- Commit: pending.

## Phase B Complete — 2026-05-12T18:23:00Z

- Added `shared/src/pairing/perfectNegotiation.ts` W3C perfect-negotiation engine (80 lines).
- Added mock RTCPeerConnection tests for initial offer/answer, polite/impolite glare, pre-SDP candidate handling, dispose.
- Exported engine from `shared/src/pairing/index.ts`.
- Validation: `bun run --cwd shared typecheck`; grep guard for transport recovery terms empty; `bun run --cwd shared test -t perfectNegotiation` ✅
- Real-device RM: not applicable for Phase B.
- Commit: pending.

## Phase C Complete — 2026-05-12T18:45:00Z

- Added `shared/src/pairing/pairingTransport.ts` long-lived peer + short-lived socket transport (177 lines).
- Added `shared/src/pairing/pairingTransport.test.ts` for store contract, untilReady, reconnect/backoff, foreground wake, ICE restart ownership, bye fatal, getWsUrl retry, guest datachannel event.
- Exported transport from `shared/src/pairing/index.ts`.
- Validation: `bun run --cwd shared typecheck`; `bun run --cwd shared test -t pairingTransport`; line count 177 ✅
- Real-device RM: not applicable for Phase C.
- Commit: pending.
