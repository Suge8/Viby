# Viby Desktop Guide

## 先看哪里

- 产品入口先看 `desktop/README.md`。
- 系统架构看 `../docs/architecture/system-overview.md`。
- 长任务活动路径先看 `../docs/internal/agent-workflow.md`。
- UI 壳层改动先看 `../docs/development/desktop-ui-shell.md`。
- 环境变量边界看 `../docs/development/runtime-environment.md`。

## 硬规则

- 不要在 desktop UI 层重写 AppCore 业务逻辑。
- desktop owns AppCore lifecycle；发布产品不暴露 CLI/npm 入口。
- AppCore 运行状态只认 supervisor canonical snapshot，不再造第二套状态机。
- 打开入口统一复用单一 URL owner。
- 端口、token、runtime-status 等运行态事实统一由 AppCore 写入并从 `~/.viby` 读取。
- pairing bridge 只负责本地 Hub authoritative bridge、WebRTC lifecycle 与最小 telemetry 上报；DataChannel ready 必须同时满足 channel open 与 guest heartbeat / business frame 持续到达，peer connected / RTT stats 不得单独推 UI ready；不得在 desktop 造第二套 session / message durable truth。
- pairing bridge 只能采样 RTCPeerConnection stats；direct / relay / RTT 归一与用户文案必须消费 shared pairing link quality owner，禁止 desktop 本地复制第二套展示逻辑。
- pairing bridge 的本地 Hub HTTP auth / retry 只认 `localHubPairingClientCore.ts` owner；Hub event stream 只认 `pairingEventBroadcaster.ts` 单一 fan-out owner；runtime / session / workspace / terminal helper 只能消费同一条 `requestJson` / `authenticate` 链。
- pairing Peer RPC dispatch 只认 `pairingBridgeCore.ts` orchestration owner；workspace / upload / terminal / push 归 `pairingBridgePeripheralRequests.ts`，禁止在 controller 或 transport 再复制第二套方法分发。
- Codex service tier pairing RPC 只桥接到本地 Hub session config owner；desktop 不得本地持久化或推导第二套 tier。
- pairing 二进制上传帧解析只能消费 shared `pairingPeerBinaryUpload.ts` 合同；Desktop 不得散写 magic/header/transferId 常量。
- Desktop remote terminal 只桥接 Hub `/terminal` socket owner；禁止在 desktop 侧新增 PTY lifecycle owner 或空 session fallback。

## 验证

- 跑 desktop touched scope 对应 focused tests / build
- 必要时补 `bun run dev:desktop` 或构建链验证
- 修改 pairing bridge / relay / WebRTC lifecycle 时额外跑：
  - `bun run test:it-pairing`
  - `bun run typecheck:integration`
