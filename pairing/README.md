# Viby Pairing Broker

`pairing/` 是 Viby 的公网配对服务。

它只负责：

- 创建一次性配对会话
- 生成扫码 URL
- 交换 WebRTC signaling
- 下发短时 TURN / ICE 配置
- 维护可重连的会话令牌
- guest claim 后生成 short code，并要求桌面明确批准
- guest reconnect 默认要求同设备签名证明，不再只靠裸 token
- 提供 claim / reconnect 后的最小手机远程壳，并通过 DataChannel 接回桌面本地 Hub
- 提供基础限流与受控 counters
- desktop bridge 优先尝试 ICE restart，并采样链路 stats 供恢复与观测使用

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

或在模块内执行：

```bash
bun run --cwd pairing build
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
- `pairing/deploy-bundle/pairing.env.example`
- `pairing/deploy-bundle/run-pairing.sh`
- `pairing/deploy-bundle/viby-pairing.service`
- `pairing/deploy-bundle/Caddyfile.pairing`
- `pairing/deploy-bundle/coturn.conf.example`
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
- `PAIRING_TURN_SECRET`
- `PAIRING_TURN_REALM`
- `PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS`
- `PAIRING_CREATE_LIMIT_PER_MINUTE`
- `PAIRING_CLAIM_LIMIT_PER_MINUTE`
- `PAIRING_RECONNECT_LIMIT_PER_MINUTE`
- `PAIRING_APPROVE_LIMIT_PER_MINUTE`

建议生产环境至少配置：

- `PAIRING_PUBLIC_URL`
- `PAIRING_REDIS_URL`
- `PAIRING_CREATE_TOKEN`
- `PAIRING_STUN_URLS`
- `PAIRING_TURN_URLS`
- `PAIRING_TURN_SECRET`

## HTTP / WS

- `POST /pairings`：创建配对会话，返回 `pairingUrl`、`hostToken`、`wsUrl`
- `POST /pairings/:id/claim`：消费一次性 ticket，返回 `guestToken`
- `POST /pairings/:id/approve`：host 核对 short code 后批准 guest 接入
- `POST /pairings/:id/reconnect-challenge`：为设备绑定过的 guest 发放一次性 reconnect nonce
- `POST /pairings/:id/reconnect`：使用已保存设备 token + 一次性 nonce 签名证明自动重连
- `POST /pairings/:id/telemetry`：host 上报链路 transport / RTT / restart 聚合样本
- `DELETE /pairings/:id`：删除配对
- `GET /metrics`：返回 broker counters + transport telemetry 聚合；若配置了 `PAIRING_CREATE_TOKEN`，同样需要 Bearer 鉴权
- `GET /pairings/:id/ws?token=...`：signaling WebSocket
- `GET /p/:id#ticket=...`：扫码落地页；首次 claim，后续自动重连

## 协议

共享协议定义在 `shared/src/pairing/`，并通过 `shared/src/index.ts` 统一导出。

## 继续阅读

- 仓库入口：`README.md`
- `../docs/development/pairing-deployment.md`
- `../docs/deployment/pairing-broker.md`
