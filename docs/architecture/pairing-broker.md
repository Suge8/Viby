# Pairing Broker 与 WebRTC Remote

## 目标

Broker 只解决“公网配对 + WebRTC signaling”。业务事实源仍在用户本机 Hub；broker 不代理 Viby API、不保存 session/message。

## 角色

- `desktop`：发起 pairing、展示二维码/配对码、持久化 host pairing、运行 host bridge。
- `hub`：本机事实源；session、message、machine、device auth 都由 Hub owner 写入。
- `web/PWA`：扫码/恢复后作为 guest，通过 DataChannel 发 Peer RPC 意图。
- `pairing broker`：ticket、token、challenge、handoff、ICE server 配置、WebSocket signal forward。

## Broker 状态

Broker session state 收缩为：

- `active`
- `deleted`
- `expired`

Broker 不维护 connected/ready/peer-left 业务状态。WebSocket 在线只是转发条件，不是 durable truth。

## Signal contract

WebSocket signal payload 只允许：

- `description`
- `candidate`
- `bye`

Broker 验 token/role/pairing 后转发给对端；不持久化 offer/answer/candidate，不补发历史 signal。

## 传输层设计

`shared/src/pairing/createPairingTransport` 是双端唯一 WebRTC owner：

1. 长寿命 `RTCPeerConnection`。
2. 短寿命 signaling socket，可重连/替换。
3. W3C Perfect Negotiation 处理 offer glare。
4. ICE candidate 早到时排队，remote description 落地后 flush。
5. ICE restart 由 transport 层触发；不是 broker 业务状态。
6. DataChannel 承载 Peer RPC、二进制上传、terminal event、push subscription 意图。

Peer 只有 `connectionState='closed'` 时才重建；网络切换、息屏、broker 重启走同一 peer 的 ICE restart / signaling reconnect。

## 恢复策略优先顺序

1. 页面 foreground pulse → 立即唤醒 signaling 并触发 transport reconnect。
2. Signaling socket 断线 → 永久指数退避 + jitter；peer 保留。
3. ICE `disconnected/failed` → `restartIce()`；DataChannel/PeerConnection identity 保留。
4. Hub 重启 → bridge 不销毁；RPC 读取最新 Hub client，不可用时返回 `hub_paused`。
5. Broker 明确 `bye pairing_unavailable` / token invalid / expired → 退出到重新扫码。

UI 不根据 broker socket 片段状态切全屏 boot。已进入 workspace 的 guest 只显示 compact reconnect notice。

## 安全模型

- QR 中只有一次性 ticket，不含长期 Hub token。
- 首次 claim 后 ticket 作废，guest token 绑定 pairing。
- Reconnect 走 challenge + device proof；设备私钥不可导出，保存在浏览器安全存储/IDB。
- PWA handoff ticket 一次性、短 TTL、启动后 scrub URL fragment。
- TURN 只作为 ICE fallback；不承载业务 owner。

## 设备 presence

Scan 设备在线状态不由 broker/Hub presence 判定。桌面 Device popover 用 host bridge phase：`ready` 在线，`connecting/fatal` 不计在线。
