# Epic: Pairing Perfect-Negotiation Reconstruction

> 用 W3C Perfect Negotiation Pattern + Mosh transport-identity 分离思想，
> 把当前 9 信号 / 多状态机 / first-claim 与 reconnect 双路径的传输栈，
> 全量重写成 3 信号 / 单状态机 / 双端对称的极简内核。
>
> 触发原因：user 报告"扫码后第一次填配对码进得快，之后任何复活都容易卡死"。
> 根因调研详见 `raw/root-cause.md`。

## Goal

让 first-claim、刷新、息屏、网络切换、Hub 重启、broker 重启，统一走**同一条** Perfect-Negotiation 路径，全部透明恢复。

## Non-Goals

- 不动 broker session HTTP 鉴权（一次性 ticket / device-reconnect challenge / handoff ticket / hostToken）
- 不动 broker 持久化层（SQLite / Redis store schema）
- 不动 Hub 业务事实源
- 不动 device key (IndexedDB non-extractable) 安全模型
- 不引入新外部依赖（无 simple-peer / peerjs 等胶水库）

## Constraints

- 协议层只允许 3 类 signal: `description | candidate | bye`
- 共享 negotiation engine ≤ 80 行（含 W3C 全部 cases）
- 单文件 ≤ 300 行（仓库硬上限）；函数 ≤ 60 行
- broker `ws.ts` 必须降到纯 forwarder（无 markConnected / emitReady / emitState / emitPeerLeft）
- desktop `pairingBridgeController.ts` + 全部 support 文件合计 ≤ 600 行（旧 ~1100 行；**不含 `*.test.ts`**）
- web `connectRemotePeer` 链路文件合计 ≤ 500 行（旧 ~1000+ 行；**不含 `*.test.ts`**）
- 全栈传输栈合计 ≤ 1800 行**不含 `*.test.ts`**（旧 ~3800 行）
- 不破坏 `bun run harness:check` / `bun run test:scripts`
- 中间任何 Phase 完成后，仓库必须可单独发布（不能有 broken state），**例外**：Phase D / E / F 是一组协调发布单元（见 R1）

## Risk Assessment

- **R1（关键）**：broker forwarder 化后 wire 格式从 `offer/answer/ready/peer-left/state/...` 变成 `description/candidate/bye`，**无 wire-level 兼容**。即使 broker 透传 raw bytes，旧客户端发 `{type:'offer'}` 新客户端期望 `{type:'description'}` 互发不通。
  - **缓解**：Phase D / E / F 作为**一个发布单元**协调升级。broker 升级与 desktop / web 客户端升级时间窗 ≤ 1 小时；staging 三端联调 ≥ 24h 不出错才允许 prod 发布。
  - **回滚**：D + E + F 任一失败，broker 必须立即回滚到上一个 release（broker session schema 字段保留向后兼容，db 不动）。
  - **不缓解**：仓库内仅一个 broker + 一对 desktop / web 客户端发布，无外部第三方客户端，安全。
- **R2**：Perfect Negotiation 在 iOS Safari 真机上的 race 行为未在仓库内完整覆盖 → Phase E/F 必须配真机回归矩阵（见下方 Done-When）。
- **R3**：删除 `pairingPresenceSync.ts` 后 link/local channel presence 不能漏 → Phase J 严格只删 scan channel 路径，link/local 保留 hub presence。
- **R4**：长时间运行内存泄漏 → Phase K 引入 stats 巡检脚本，1h 真机跑确认。
- **R5**：`setLocalDescription()` 无参在 Safari 13.1 历史有 bug；engine 改用显式两步 `createOffer/Answer + setLocalDescription(desc)`，全浏览器兼容。
- **R6**：iOS Safari 后台冻结 WebRTC → Phase C transport 暴露 `notifyForeground()` API，Phase F 在 `subscribeForegroundPulse` 时调用，触发 socket 立即重连 + ICE 检查。

## Architecture Target

```
            ┌────────────────────────────────────────┐
            │  Pairing identity (持久)                │
            │  hostToken / guestToken / deviceKey    │
            └────────────────┬───────────────────────┘
                             │
                ┌────────────▼────────────┐
                │  Long-lived              │
                │  RTCPeerConnection       │ ← 跨网络切换/休眠/重连复用
                │  + DataChannel "control" │
                │  + PerfectNegotiation    │
                └────────────┬─────────────┘
                             │ description / candidate / bye
                ┌────────────▼────────────┐
                │  Short-lived             │
                │  SignalingSocket         │ ← 透明重连 (exp backoff + jitter)
                └────────────┬─────────────┘
                             │
                 ┌───────────▼───────────┐
                 │  broker = pure forwarder │
                 │  + token auth            │
                 │  + GC by TTL             │
                 └──────────────────────────┘
```

## Child Deliverables

| ID | Phase | Goal | Output |
|---|---|---|---|
| 1 | A. Signal Schema | 收缩协议 contract 到 3 类信号 | `shared/src/pairing/pairingSignal.ts` |
| 2 | B. Negotiation Engine | W3C Perfect Negotiation 共享内核 | `shared/src/pairing/perfectNegotiation.ts` (≤80 行) |
| 3 | C. Pairing Transport | host/guest 共用 transport 工厂 | `shared/src/pairing/pairingTransport.ts` (≤200 行) |
| 4 | D. Broker Forwarder | broker `ws.ts` 退回纯 forwarder | `pairing/src/ws.ts` ≤120 行 |
| 5 | E. Desktop Bridge Rewrite | 桌面切到 createPairingTransport | `desktop/src/lib/pairingBridge*.ts` 合计 ≤600 行 |
| 6 | F. Web RemotePeerSession | guest 切到 createPairingTransport | `web/src/remote/RemotePeerSession.ts` + Controller 改 |
| 7 | G. UI 3 态 + IDB Hydrate | 删 booting/reconnecting/approval 中间态 | controller 状态机 + `RemotePairingPersistence.ts` |
| 8 | H. Timing Cleanup | 删 CONNECT_TIMEOUT / MAX_ATTEMPTS / BOOT_STUCK_RESCUE | `shared/src/pairing/pairingTiming.ts` |
| 9 | I. Bridge / Hub Decouple | bridge 不再依赖 hub status | `desktop/src/hooks/usePairingBridges.ts` |
| 10 | J. Presence Source Migration | popover 读 bridge phase；删 scan-channel hub presence | `desktop/src/components/DeviceCount.tsx` + `hub/src/web/routes/*` |
| 11 | K. Legacy Cleanup + Docs | 删旧 9 信号 schema / transportId / startedOffer / docs 重写 | `docs/architecture/pairing-*.md` + 各 cleanup |

## Dependency Notes

```
A ──┬─→ B
    └─→ D
B ──→ C
A,B ─→ C
C,D ─→ E
C,D ─→ F
F ──→ G
E,F ─→ H
E ──→ I
E,I ─→ J
all ─→ K
```

`depends_on` 用 `;` 分隔多个 id。详见 `SUBTASKS.csv`。

## Collaboration Notes

- 每个 child task 写自己的 `tasks/<id>/SPEC.md` + `TODO.csv` + `PROGRESS.md`
- `write_scope` 严格按上表，禁止跨界写
- **D / E / F 协调发布**：三者作为一个发布单元，broker 升级与客户端升级时间窗 ≤ 1 小时。staging 必须三端同时在新协议下联调 RM1+RM3+RM4+RM7 通过 ≥ 24h 才允许 prod 发布。任一端实施期间 main 分支仍维持旧协议可工作。
- 中间过渡期 broker 不试图兼容旧 wire：D / E / F 任一未 merge 时，broker 上游分支仍是旧实现
- 真机验证由人工 + 真机 checklist 完成；自动化测试只能保底，不能替代

## Done-When

### 自动化验收

- [ ] 所有 child rows `DONE`
- [x] `bun run --cwd shared typecheck && bun run --cwd shared test` 全过
- [x] `bun run --cwd pairing test` 全过（含新 forwarder 单测、旧 e2e 套件）
- [x] `bun run --cwd desktop typecheck && bun run --cwd desktop test` 全过
- [x] `bun run --cwd web typecheck && bun run --cwd web test && bun run --cwd web build` 全过
- [x] `bun run harness:check && bun run test:scripts` 全过
- [x] 净行数：传输栈合计 ≤ 1800 行（**不含 `*.test.ts`**）

### 真机回归矩阵（必跑，记录在 `raw/regression-matrix.md`）

| # | 场景 | 期望 |
|---|---|---|
| RM1 | 首次扫码 + 输 6 位码 | 1-2s 内 ready；UI 平滑 |
| RM2 | iPhone Safari 息屏 30s 醒来 | 透明恢复，无任何"恢复中"通知超过 2s |
| RM3 | iPhone Safari 息屏 10min 醒来 | 透明 ICE restart，DataChannel 复用 |
| RM4 | iPhone Safari Wi-Fi → 蜂窝 切换 | ICE restart 自动选择新路径，1-3s 恢复 |
| RM5 | iPhone Safari 刷新页面 | IDB hydrate 立即挂壳，后台 reconnect 无全屏 boot |
| RM6 | PWA 独立模式启动（handoff ticket） | claim 完成 → 长寿命 peer 建立 |
| RM7 | 桌面关 hub 5s → 开 hub | bridge phase 不抖；popover 不闪 0 设备 |
| RM8 | broker 服务短暂重启（10s） | guest signaling socket 透明重连；peer.restartIce 自动恢复 |
| RM9 | broker 服务长不可达（60s） | guest 持续退避不卡死；UI 显示"正在恢复…（N 次）[停止]" |
| RM10 | 桌面解绑设备 | guest 收 `bye` → 跳重扫页面 |
| RM11 | 同时配对 2 部手机 | 互不干扰；popover 显示 2 台 |
| RM12 | 1h 长时间运行 | webrtc-internals 显示 peer 复用；无新 PeerConnection 创建；内存稳定 |

### 协议层最终验收

- [x] broker `pairing/src/ws.ts` 不含 `markConnected / markDisconnected / emitReady / emitState / emitPeerLeft / disconnectGrace.finalize` 中的 peer-left 通知
- [x] `shared/src/pairing/pairingSignal.ts` 只导出 `description / candidate / bye` 三类
- [x] `desktop/src/lib/pairingBridgeController.ts` 不含 `rebuildTransport / shouldRebuildForGuestReady / guestTransportId / startedOffer`
- [x] `web/src/remote/remotePairingTransport.ts` 文件**删除**或重命名为 `RemotePeerSession.ts` ≤ 200 行
- [x] `desktop/src/lib/pairingPresenceSync.ts` 文件**删除**
- [x] docs/architecture/pairing-broker.md 不含 "shouldRebuildForGuestReady" / "transportId" 描述
- [x] 新增 docs/architecture/pairing-reconnection.md 详细记录 perfect negotiation engine 协议契约

### 前端展示点对应矩阵（后后端改动必须同步）

| # | 前端展示点 | 受影响文件 | SPEC 责任 |
|---|---|---|---|
| F1 | `PairingTransportState` (`connecting/ready/fatal` + attempt) | `shared/src/pairing/pairingTransport.ts` | Phase C |
| F2 | `RemotePeerBridge` 接口 60+ 方法 + subscribe + getSnapshot 完整 implement | `web/src/remote/RemotePeerSession.ts` + `remotePairingBridgeTypes.ts` | Phase F |
| F3 | `useSyncExternalStore(session.subscribe, session.getSnapshot)` 接入 controller / popover / notice | RemotePairingController + DeviceCount | Phase F + G + H + J |
| F4 | `PairingBridgeState.phase` 5机 → 3机 (`connecting/ready/fatal`) | `desktop/src/types.ts` + 所有读 phase 的 UI | Phase E |
| F5 | Desktop popover 状态文案表 (`已连接` / `正在握手` / `连接中断` / `等待连接`) | `DeviceCount.tsx` + `deviceLinkBadge.ts` + `deviceListPresentation.ts` | Phase E + J |
| F6 | Desktop `PairingCard.tsx` 绑定状态标签适配新 phase 枚举 | `PairingCard.tsx` | Phase E |
| F7 | `RemoteState` 5机 → 4机 (`hydrating/first-pairing/running/fatal`) | `RemotePairingController.tsx` + `remotePairingViewModel.tsx` | Phase G |
| F8 | `RemoteConnectingPhase` 4子态 → 3子态 (`pairing/verify/finalizing`) | `lib/remoteConnectingPhase.ts` + 全部调用 | Phase G |
| F9 | `RemotePairingStatusScreen` 仅 `first-pairing/fatal` 状态渲染 | `RemotePairingScreens.tsx` + `RemoteConnectingScreen.tsx` | Phase G |
| F10 | IDB hydrate skeleton (≤ 200ms) 替代全屏 "正在连接你的电脑" | `RemotePairingHydrateSkeleton.tsx` + `RemotePairingPersistence.ts` | Phase G |
| F11 | Reconnect notice 加 attempt 计数 + [停止] 按钮 | `remotePairingViewModel.tsx` + `persistentNoticePresentation.ts` + Controller | Phase H |
| F12 | i18n keys 清理：删 13 个 fatal error / phase.connecting，新增 4 个 key | `web/src/lib/locales/zh-CN-primary.ts` + `en-primary.ts` | Phase G |
| F13 | `mapByeToErrorKey` 5 reasons → error keys | `remotePairingErrors.ts` | Phase F |
| F14 | scan 设备在线状态不再读 hub presence | `DeviceCount.tsx` + `hub/src/sync/devicePresenceTracker.ts` | Phase J |

**验证门 (Phase K)**：Phase K SPEC 加一个 "前端对应 audit" 脚本，grep 上表所有错误状态（20+ 项）必须返回空，才能收 EPIC。

## Final Validation Command

```bash
bun run harness:check && \
bun run test:scripts && \
bun run --cwd shared test && \
bun run --cwd pairing test && \
bun run --cwd desktop test && \
bun run --cwd web typecheck && \
bun run --cwd web test && \
bun run --cwd web build && \
node scripts/count-pairing-transport-lines.mjs --max 1800
```

(`scripts/count-pairing-transport-lines.mjs` 在 Phase K 实施，作为长度护栏；脚本默认排除 `*.test.ts` / `*.test.tsx` / `__tests__/` 路径)

## Out-of-Scope Followups（重构完成后再做）

- TURN 凭证旋转策略
- WebTransport / WebRTC over QUIC 升级
- pairing broker 多区部署
- 设备组多用户多 host 模型
