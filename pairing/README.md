# Viby Pairing Broker

`pairing/` 是 Viby 的公网配对服务。
它只负责：

- 创建一次性配对会话
- 生成扫码 URL
- 交换 WebRTC signaling
- 转发 `/tunnel` relay frame；设备先可用，再并发升级 direct
- 下发 STUN ICE 配置；direct 在 DataChannel heartbeat 健康且未选到 relay candidate 时成为 active route
- 维护可重连的会话令牌
- 创建时生成配对码；桌面显示，手机提交正确配对码和设备公钥后自动批准
- guest reconnect 默认要求同设备签名证明，不再只靠裸 token
- 托管手机端正常 Viby Web，并通过 relay tunnel / direct DataChannel 接回桌面本地 Hub
- 提供基础限流与受控 counters
- desktop bridge 保持 relay standby，direct stale 后退回 relay，并采样链路 stats 供恢复与观测使用

它不负责：

- session / message 业务事实源
- 长期用户密钥存储
- broker 侧 durable 业务代理

## 运行

```bash
bun run dev:pairing
```

## 打包部署

现在默认部署主路径是生成最小部署目录，而不是整仓上传：

```bash
bun run build:pairing
```

产物目录：

```text
pairing/deploy-bundle/
```

同时还会生成：

```text
pairing/deploy-bundle.tar.gz
pairing/deploy-bundle.sha256
```

其中最关键的是：

- `pairing/deploy-bundle/index.js`
- `pairing/deploy-bundle/web-index.html`
- `pairing/deploy-bundle/build-meta.json`
- `pairing/deploy-bundle/assets` 目录
- `pairing/deploy-bundle/brand-logo-tight.png`
- `pairing/deploy-bundle/pairing.env.example`
- `pairing/deploy-bundle/run-pairing.sh`
- `pairing/deploy-bundle/viby-pairing.service`
- `pairing/deploy-bundle/viby-pairing.logrotate`
- `pairing/deploy-bundle/viby-pairing-health-check.sh`
- `pairing/deploy-bundle/Caddyfile.pairing`
- `pairing/deploy-bundle/DEPLOY.md`

默认配置可通过环境变量覆盖：

- `PAIRING_HOST`
- `PAIRING_PORT`
- `PAIRING_PUBLIC_URL`
- `PAIRING_REDIS_URL`
- `PAIRING_CREATE_TOKEN`
- `PAIRING_SESSION_TTL_SECONDS`
- `PAIRING_TICKET_TTL_SECONDS`（PWA handoff ticket TTL）
- `PAIRING_STUN_URLS`
- `PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS`
- `PAIRING_CREATE_LIMIT_PER_MINUTE`
- `PAIRING_CLAIM_LIMIT_PER_MINUTE`（PWA handoff claim）
- `PAIRING_RECONNECT_LIMIT_PER_MINUTE`
- `PAIRING_APPROVE_LIMIT_PER_MINUTE`

STUN 只用于 P2P 候选发现；生产至少配置 2 个不同网络入口。selected candidate 是 relay 时不会接管业务，继续使用 sealed WSS relay。

建议生产环境至少配置：

- `PAIRING_PUBLIC_URL`
- `PAIRING_REDIS_URL`
- `PAIRING_CREATE_TOKEN`
- `PAIRING_STUN_URLS`

## HTTP / WS

- `POST /pairings`：创建配对会话，返回 `pairingUrl`、`hostToken`、`wsUrl`、`tunnelUrl`
- `POST /pairings/:id/verify-code`：guest 提交桌面显示的 6 位配对码和设备 `publicKey`，正确后自动批准并返回 `guestToken`
- `POST /pairings/:id/pwa-handoff-ticket`：已绑定设备为 PWA 安装/冷启动申请一次性 handoff ticket
- `POST /pairings/:id/pwa-handoff-claim`：PWA 消费 handoff ticket，返回新连接 token
- `POST /pairings/:id/approve`：host 侧保留调试批准接口；产品 UI 默认不暴露
- `POST /pairings/:id/reconnect-challenge`：为设备绑定过的 guest 发放一次性 reconnect nonce
- `POST /pairings/:id/reconnect`：使用已保存设备 token + 一次性 nonce 签名证明自动重连
- `POST /pairings/:id/telemetry`：host 上报链路 transport / RTT / restart 聚合样本
- `DELETE /pairings/:id`：删除配对
- `GET /ready`：返回 broker readiness，并通过 store owner 检查 Redis / memory store
- `GET /metrics`：返回 broker counters、websocket pressure 与 transport telemetry 聚合；若配置了 `PAIRING_CREATE_TOKEN`，同样需要 Bearer 鉴权
- `GET /pairings/:id/ws?token=...`：signaling WebSocket
- `GET /pairings/:id/tunnel?token=...`：relay tunnel WebSocket，只转发 shared `PairingTunnelFrame`
- `GET /p/:id`：手机端正常 Viby Web 入口；首次 verify-code，后续自动重连

## 协议

共享协议定义在 `shared/src/pairing/`，通过 `shared/src/index.ts` 统一导出。

## 继续阅读

- 仓库入口：`README.md`
- `../docs/development/pairing-deployment.md`
- `../docs/deployment/pairing-broker.md`
