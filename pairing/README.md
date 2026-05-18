# Viby Pairing Broker

`pairing/` 是 Viby 的公网配对服务。
它只负责：

- 创建一次性配对会话
- 生成扫码 URL
- 交换 WebRTC signaling
- 转发 `/tunnel` relay frame；设备先可用，再并发升级 direct
- 下发 STUN + TURN ICE 配置；direct 只在非 TURN candidate 证明健康后成为 active route
- 维护可重连的会话令牌
- guest claim 后生成配对码；桌面显示，手机输入正确后自动批准
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
bun run --cwd pairing dev
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
- `PAIRING_TICKET_TTL_SECONDS`
- `PAIRING_STUN_URLS`
- `PAIRING_TURN_URLS`
- `PAIRING_TURN_STATIC_AUTH_SECRET`
- `PAIRING_TURN_CREDENTIAL_TTL_SECONDS`
- `PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS`
- `PAIRING_CREATE_LIMIT_PER_MINUTE`
- `PAIRING_CLAIM_LIMIT_PER_MINUTE`
- `PAIRING_RECONNECT_LIMIT_PER_MINUTE`
- `PAIRING_APPROVE_LIMIT_PER_MINUTE`

TURN 建议按 `UDP 3478 -> TCP 3478 -> TLS 5349` 排列；多地区就把最近 TURN 节点排在 `PAIRING_TURN_URLS` 最前。

建议生产环境至少配置：

- `PAIRING_PUBLIC_URL`
- `PAIRING_REDIS_URL`
- `PAIRING_CREATE_TOKEN`
- `PAIRING_STUN_URLS`
- `PAIRING_TURN_URLS`
- `PAIRING_TURN_STATIC_AUTH_SECRET`

## HTTP / WS

- `POST /pairings`：创建配对会话，返回 `pairingUrl`、`hostToken`、`wsUrl`、`tunnelUrl`
- `POST /pairings/:id/claim`：消费一次性 ticket，返回 `guestToken`
- `POST /pairings/:id/verify-code`：guest 输入桌面显示的 6 位配对码，正确后自动批准接入
- `POST /pairings/:id/approve`：host 侧保留调试批准接口；产品 UI 默认不暴露
- `POST /pairings/:id/reconnect-challenge`：为设备绑定过的 guest 发放一次性 reconnect nonce
- `POST /pairings/:id/reconnect`：使用已保存设备 token + 一次性 nonce 签名证明自动重连
- `POST /pairings/:id/telemetry`：host 上报链路 transport / RTT / restart 聚合样本
- `DELETE /pairings/:id`：删除配对
- `GET /ready`：返回 broker readiness，并通过 store owner 检查 Redis / memory store
- `GET /metrics`：返回 broker counters、websocket pressure 与 transport telemetry 聚合；若配置了 `PAIRING_CREATE_TOKEN`，同样需要 Bearer 鉴权
- `GET /pairings/:id/ws?token=...`：signaling WebSocket
- `GET /pairings/:id/tunnel?token=...`：relay tunnel WebSocket，只转发 shared `PairingTunnelFrame`
- `GET /p/:id#ticket=...`：手机端正常 Viby Web 入口；首次 claim，后续自动重连

## 协议

共享协议定义在 `shared/src/pairing/`，通过 `shared/src/index.ts` 统一导出。

## 继续阅读

- 仓库入口：`README.md`
- `../docs/development/pairing-deployment.md`
- `../docs/deployment/pairing-broker.md`
