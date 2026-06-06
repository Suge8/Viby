# Architecture Deepening Plan

> 本计划是本次长任务的执行依据。它不是 ADR：这里记录待实施方案、顺序、验证与风险；ADR 只在方案落地后、或某个承重取舍需要长期约束未来评审时再写。

## 目标

加深 3 个浅模块，让接口更小、实现吸收更多复杂性，提升局部性、测试表面与 AI 可导航性。

实施顺序：

1. Remote workspace adapter
2. Hub session command 模块
3. selected-session workspace 模块

## 术语

- 模块：有接口和实现的代码单元或功能切片。
- 接口：调用方必须知道的一切，包括类型、不变量、顺序、错误模式、配置。
- 实现：模块内部代码。
- 深模块：小接口背后隐藏大量行为，带来杠杆收益和局部性。
- 接缝：接口所在位置；可以换行为而不用原地改实现。
- 适配器：在接缝处满足接口的具体实现。

## 1. Remote workspace adapter

### 决策：BCCBC

1. **B：统一 workspace 对象**
   - 本机与远程最终都走同一种 workspace 形状。
   - App 不直接知道 remote peer RPC。

2. **C：Desktop 经 pairing 协议传真实 runtime**
   - 不再由 Web 伪造远程 runtime 作为长期主路径。
   - Desktop / Hub 作为 runtime truth owner，通过 pairing 协议给远程 Web。

3. **C：ApiClient adapter 写 cache，bridge 保持纯 RPC**
   - `RemotePeerBridge` 只做 transport/RPC。
   - `RemotePeerApiClient` 负责把 peer RPC 结果适配成 Web `ApiClient` 语义，并写 React Query cache。
   - `RemoteWorkspaceAdapter` 只装配 workspace，不接管具体 session cache。

4. **B：白名单 + typed helper**
   - 保留显式能力白名单。
   - 用 typed helper 减少手写转发和类型漂移。
   - 禁止直接暴露完整 `ApiClient`。

5. **C：adapter 单元测试 + 远程流程测试**
   - 单元测 workspace 接口、runtime 注入、subscribe、provider 注入。
   - 保留现有 remote / pairing 流程测试。

### 目标形状

- `RemoteWorkspaceAdapter` 成为远程 workspace 深模块。
- `RemotePeerBridge` 成为纯 RPC 适配器。
- `RemotePeerApiClient` 成为 peer RPC -> Web `ApiClient` 的适配器，拥有 cache 写入。
- pairing 协议能传真实 runtime snapshot。
- App 逐步只消费 workspace 对象。

### 主要文件

- `web/src/remote/remoteWorkspaceAdapter.ts`
- `web/src/remote/remotePeerApiClient.ts`
- `web/src/remote/remotePairingBridgeTypes.ts`
- `shared/src/pairing/pairingPeerRpcSchema.ts`
- `shared/src/pairing/pairingPeerRpcExtendedSchema.ts`
- `desktop/src/lib/pairingPeerRpcCore.ts`
- `web/src/remote/RemotePairingReadyShell.tsx`（如存在调用点）

### 实施步骤

1. 梳理 local / remote workspace 当前入口。
2. 定义 workspace 对象最小接口。
3. 扩 pairing RPC：增加 runtime snapshot 获取或随 ready handoff 返回。
4. 调整 Desktop 端适配器，返回真实 runtime snapshot。
5. 调整 Web remote adapter，消费真实 runtime。
6. 提取 typed pick helper，替代散落方法绑定。
7. 补 adapter 单元测试和 remote 流程回归。

### 验证

- `bun run --cwd web typecheck`
- remote adapter focused tests
- `bun run test:it-pairing`
- `bun run typecheck:integration`
- 必要时 `bun run --cwd web build`

## 2. Hub session command 模块

### 决策：B / B+C / B / B / C

1. **B：统一 `executeSessionCommand`**
   - 用户命令走统一入口：`{ type, sessionId, payload }`。
   - 调用方不再了解每个命令的内部顺序。

2. **B+C：Hub policy 最终裁决；shared 只做 UI 投影**
   - Hub command policy 是最终合法性 owner。
   - shared 只提供展示级禁用/可用投影，不能成为 durable truth。

3. **B：Result 错误**
   - 命令错误是业务输出，不用 throw 表达正常业务失败。
   - 目标形状：`{ ok: true, session/result } | { ok: false, error }`。

4. **B：公开接口不拆，内部拆实现**
   - 对外一个 command 接缝。
   - 内部拆 lifecycle / liveConfig / driverSwitch 实现。

5. **C：表驱动 command 测试 + 少量 route smoke**
   - 主测试表面是 `executeSessionCommand`。
   - route 只测 HTTP 适配和错误映射。

### 目标形状

- `SessionCommandService` 变成深模块。
- 公开接口：统一命令入口。
- 内部：policy 表 + executor + result mapper。
- route 层只做 HTTP 输入/输出适配。
- `SyncEngineSessionApi` 可逐步收窄对 session command 的暴露。

### 主要文件

- `hub/src/sync/sessionCommandService.ts`
- `hub/src/sync/sessionLifecycleService.ts`
- `hub/src/sync/sessionDriverSwitchService.ts`
- `hub/src/sync/syncEngineSessionApi.ts`
- `hub/src/web/routes/sessionActionRoutes.ts`
- `hub/src/web/routes/sessionConfigRoutes.ts`
- `shared/src/sessionConfigSupport.ts`（UI 投影相关）

### 实施步骤

1. 列出现有命令：abort / close / archive / unarchive / resume / driver-switch / permission / collaboration / model / reasoning / codex tier。
2. 定义 `SessionCommand` union 与 `SessionCommandResult`。
3. 建立 Hub command policy 表：session state、driver、live support、错误码。
4. 将现有方法迁到 `executeSessionCommand` 内部 executor。
5. 保留旧方法作为短期内部转接，route 逐步迁到统一入口；稳定后删除旧公开方法。
6. route 错误映射改消费 Result。
7. 补表驱动测试覆盖命令合法性、状态迁移、错误码。

### 验证

- Hub focused tests：`sessionCommandService` / routes
- `bun run --cwd hub test` 或对应 focused test
- `bun run typecheck:integration`（如 touched shared 合同）
- 涉及 pairing remote command 时跑 `bun run test:it-pairing`

## 3. selected-session workspace 模块

### 决策：BBBAC

1. **B：返回 workspace state + actions**
   - 接口表达 workspace phase / render model / actions。
   - 不直接返回 React element，避免 UI 与状态粘死。

2. **B：retained snapshot 由 workspace 自己拥有**
   - 调用方不再传 `retainedSnapshot/onRetainedSnapshotReady`。
   - retained 语义集中在 selected-session workspace。

3. **B：boot shell finalize 归 workspace effects**
   - workspace 明确拥有“ready 后释放 boot shell”。
   - App root 不知道 selected-session 细节。

4. **A：message-window bottom entry 仍归 selected-session workspace**
   - 它是 session entry 语义。
   - 但必须包装成 workspace entry effect，不裸散调用。

5. **C：pure reducer + hook integration**
   - 核心 pending/retained/ready 规则用纯 reducer 测。
   - 副作用用 hook integration 少量覆盖。

### 目标形状

- `useSelectedSessionWorkspace` 变深模块。
- 调用方只知道 workspace state，不知道 retained snapshot 细节。
- pending / retained / ready、boot finalize、entry bottom effect 都集中。
- `selectedSessionChatViewModel.ts` 可演进成 pure reducer / state machine。

### 主要文件

- `web/src/routes/sessions/useSelectedSessionWorkspace.ts`
- `web/src/routes/sessions/selectedSessionChatViewModel.ts`
- `web/src/routes/sessions/useSessionChatRouteModel.ts`
- `web/src/routes/sessions/SessionsShell.tsx`
- `web/src/lib/messageWindowStoreCore.ts`

### 实施步骤

1. 定义 selected-session workspace state：`pending | retained | ready`。
2. 将 retained snapshot owner 移入 hook/module。
3. 把 `useFinalizeBootShell` 封装成 workspace effect。
4. 把 `setMessageWindowAtBottom(sessionId, true)` 封装成 entry effect。
5. 调用方改消费 workspace state + actions。
6. 为 pure reducer 补表驱动测试。
7. 为 hook 补 retained / ready / session switch integration tests。

### 验证

- `bun run --cwd web typecheck`
- selected-session focused tests
- `bun run --cwd web build`
- 有 UI 行为变化时补浏览器证据或 smoke

## 总体风险与约束

- 禁止引入第二 owner：runtime truth、session command truth、selected-session entry truth 都必须单一。
- 新主路径稳定后删除旧转接公开接口，避免长期双轨。
- route / UI 只消费深模块接口，不复制 policy。
- shared 只能承载展示投影或协议合同，不能抢 Hub durable truth。
- 每阶段只改当前模块需要的接缝，不顺手重构无关路径。

## 完成标准

- 三个模块的接口变小，调用方知道更少。
- 关键不变量有 focused tests。
- touched docs 同步。
- 受影响 typecheck / tests / build 通过。
- 如 touched pairing / remote：`test:it-pairing` 与 `typecheck:integration` 通过。
