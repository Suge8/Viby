# Pairing Guide

## 先看这里

- 入口先看 `pairing/README.md`
- 生产部署先看 `../docs/deployment/pairing-broker.md`
- Desktop 接入与操作再看 `../docs/operations/pairing-mode.md`
- 协议合同与系统边界再看 `../docs/architecture/pairing-broker.md`
- 长任务活动路径再看 `../docs/internal/agent-workflow.md`

## Pairing 硬规则

- `pairing/` 只负责一次性配对、verify-code / PWA handoff / reconnect、signaling、TURN / ICE 配置，不维护第二套 session / message durable truth。
- 配对票据、guest token、host token 必须保持短时、单用途语义；禁止把长期认证或 Hub durable owner 混进 broker。
- 已绑定设备的 guest reconnect 必须继续只认 broker-issued one-time challenge nonce + device proof；禁止退回裸 guest token 直连。
- WebRTC signaling、verify-code、PWA handoff ticket、reconnect token 只认 `pairing/` owner；Web / desktop / hub 不得并行维护第二套公网 broker 协议。
- 共享 schema、错误码、事件合同只认 `shared/src/pairing/` owner；`pairing/` 不复制第二套 schema。
- broker 只收集用户态 direct / relay / unknown 与内部 direct-webrtc / turn-webrtc / relay-wss telemetry；用户可见链路质量文案与 candidate 归一只认 shared pairing link quality owner。
- 新主路径稳定后直接删旧兼容链，不保留长期双实现。

## 验证基线

- `bun run --cwd pairing typecheck`
- `bun run --cwd pairing test`
- `bun run --cwd pairing build`
- 修改 broker socket / tunnel / pairing contract 时额外跑：
  - `bun run test:it-pairing`
  - `bun run typecheck:integration`
