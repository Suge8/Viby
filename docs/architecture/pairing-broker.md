# Pairing Broker 与 Tunnel v2

## 目标

Broker 只解决“公网配对 + relay/tunnel + WebRTC signaling”。业务事实源仍在用户本机 Hub；broker 不保存 session/message，不拥有业务状态。

## 角色

- `desktop`：发起 pairing、展示二维码/配对码、持久化 host pairing、运行 host bridge。
- `hub`：本机事实源；session、message、machine、device auth 都由 Hub owner 写入。
- `web/PWA`：扫码/恢复后作为 guest，先走 relay tunnel，可用后并发尝试 direct。
- `pairing broker`：ticket、token、challenge、handoff、ICE server 配置、WebSocket signal forward、opaque tunnel frame forward。

## Broker 状态

Broker session state 收缩为：

- `active`
- `deleted`
- `expired`

Broker 不维护 connected/ready/peer-left 业务状态。WebSocket 在线只是转发条件，不是 durable truth。

## Socket contract

`/pairings/:id/ws` 只允许 WebRTC signal：

- `description`
- `candidate`
- `bye`

`/pairings/:id/tunnel` 只允许 broker 可见的 `PairingTunnelRelayFrame`：

- `key`
- `sealed`

`key` 是端点临时 ECDH 公钥，`sealed` 是 AES-GCM 密文。端点解密后才会得到本地 `message` / `binary` / `heartbeat` / `heartbeat-ack` plain frame。Broker 验 token/role/pairing 后只转发 opaque relay frame，不解析业务 payload。

`/ws` 为 attach 竞态保留每个目标角色最多 128 条内存中的早到 signal，晚到 peer 接上即 flush；这只覆盖 offer/candidate 时序，不是 durable history。`/tunnel` 不缓存业务 frame，不补发历史消息。因为 tunnel 不缓存，端点收到对端 `key` 后会重发本端 `key`，修复 host 先打开、guest 后 attach 时的 key 丢失竞态。

## 传输层设计

Tunnel v2 的主规则：

1. WSS relay tunnel 先连接，`WebSocket/TLS` 打开且 ECDH key exchange 完成后进入业务可用态。
2. WebRTC 并发探测；selected candidate 为 `host/srflx/prflx` 且 heartbeat 证明健康时，只要 RTT 不比 WSS relay 慢超过 30ms，就升级为 `direct-webrtc`。
3. selected candidate 为 `relay` 时不叫 P2P，内部记为 `turn-webrtc`；只有 TURN RTT 不慢于 WSS relay 时才用它，否则继续 WSS。
4. `direct-webrtc` / `turn-webrtc` stale、close、missed ACK 达预算时退回 `relay-wss`；WSS relay 保持 standby。
5. route 状态只认 `shared/src/pairing/pairingTunnelRoute.ts` reducer；Web / Desktop / broker 不再各自猜测 active route。
6. `/ws` 继续只做 WebRTC signaling，`/tunnel` 只承载 sealed relay frame；Peer RPC / sync event / terminal event 都在端点内加密后进入 relay。

Route reducer 带事件驱动滞后：第一次 direct 只需少量 ACK 即可从 relay 升级；direct 失败或 missed ACK demote 后，下一次升级需要更多 ACK；direct 探测 RTT 不覆盖当前 active relay RTT，避免 UI 显示和路由状态裂开。当前产品策略是 P2P-preferred：P2P 已证明可用且没有明显慢很多就切；TURN 不是 P2P，只做 WSS relay 前面的低延迟中转层。

Relay active 时也要主动争取 direct：relay open、relay heartbeat ACK、foreground pulse 都会在当前不是 `direct-webrtc` 且没有 direct probe 运行时触发一次 ICE restart。Relay heartbeat ACK 是 active relay RTT 的事实源，避免 UI 长期停在“测速中”。Peer heartbeat 带 `id/sentAt/ack`，两端只把 `ack=true` 当作 RTT 样本，普通 heartbeat 只回 ACK，避免双向保活互相误判。这里不是第二套路由控制器；heartbeat 是 NAT keepalive + 观测，route 决策仍只进 reducer。

Desktop host bridge 也消费同一 reducer：`RTCPeerConnection` 不存在或 direct signaling 失败时，Desktop 仍然通过 relay tunnel 进入 ready，不再把 WebRTC 当成可用性的前提。WebRTC selected candidate 非 TURN relay 时才显示“点对点直连”；selected candidate 是 TURN relay 时显示“安全中转”，内部 `activeTransport='turn-webrtc'`。

`shared/src/pairing/createPairingTransport` 仍是 WebRTC direct adapter：

1. 长寿命 `RTCPeerConnection`。
2. 短寿命 signaling socket，可重连/替换。
3. W3C Perfect Negotiation 处理 offer glare。
4. ICE candidate 早到时排队，remote description 落地后 flush。
5. ICE restart 由 transport 层触发；不是 broker 业务状态。
6. DataChannel 只作为 WebRTC route，不再是可用性的前提。

这里不内嵌 NetBird / WireGuard，也不把 Go QUIC / WebTransport 当当前 direct P2P 主路径：手机端仍是 Web/PWA，浏览器不暴露通用 UDP/WireGuard socket；WebTransport 是浏览器到 HTTP/3 server 的 client-server transport，不是 browser-to-desktop P2P socket。当前最佳路径就是 WebRTC P2P direct 第一、WebRTC TURN UDP 第二、sealed WSS relay 兜底。

Native desktop UDP/QUIC host 已从当前移动 Web 产品路径裁掉：只替换桌面一端不能让手机浏览器绕开 WebRTC，反而会复制一套 transport/bridge owner。只有当手机端变成 native app，或真实 harness 证明桌面 WebView WebRTC 是主要失败源时，才重新引入 native direct adapter；即便引入，也必须继续消费同一条 route reducer。

## 网络验收矩阵

Tunnel v2 的链路测试分三层，不把本地模拟当公网结论：

- `harness:pairing-netem`：本机 broker + 两个 Docker endpoint，用 `tc netem` 注入延迟、抖动、丢包、短暂 100% blackhole 和 degraded cellular 恢复；用于稳定复现 relay / sealed frame / handover 回归。
- `harness:pairing-prod-relay`：两个 Docker endpoint 都连 `https://pair.viby.run`，验证生产 TLS、反代、broker、sealed relay 和公网 RTT。
- `harness:pairing-public-turn-webrtc`：两份本机 Chromium 强制 `iceTransportPolicy='relay'` 通过生产 TURN 建 WebRTC DataChannel；要求 selected candidate 都是 `relay`，验证 TURN UDP/TCP/TLS 下发与 coturn 可用。
- `harness:pairing-public-direct-webrtc`：两份本机 Chromium 通过生产 `/ws` signaling 建 WebRTC DataChannel；这是生产 signaling smoke，不代表真实 NAT。
- `harness:pairing-remote-direct-webrtc`：本机 Chromium host + 远端 SSH runner 上的 aiortc guest 通过生产 broker 信令，要求 DataChannel ACK 成功且本机浏览器 selected ICE candidate 不是 TURN relay；这是当前自动化里最接近真实公网 P2P 的门。

真手机蜂窝/Wi-Fi handover 仍需要真机矩阵；自动化只能覆盖可重复的网络损伤和跨公网 direct。

调研依据：

- MDN WebRTC API：浏览器原生支持 peer-to-peer `RTCPeerConnection` / `RTCDataChannel`。
- MDN WebTransport API：WebTransport 让 user agent 连接 HTTP/3 server，提供 client-server streams/datagrams。
- Tailscale connection types：所有连接先经 DERP relay 建立可达性，再尝试升级 direct；失败继续 relay，并周期性重试。
- NetBird docs：NetBird 用 WireGuard + Pion ICE + Coturn/Relay，ICE 选 host/srflx/prflx/direct，relay 是兜底；这适合 native agent/VPN，不适合只内嵌到手机 Web。

Peer 只有 `connectionState='closed'` 时才重建；网络切换、息屏、broker 重启走同一 peer 的 ICE restart / signaling reconnect。

## 恢复策略优先顺序

1. 页面 foreground pulse → 立即唤醒 signaling 并触发 transport reconnect。
2. Relay tunnel ready/heartbeat → 如果当前仍走 relay，立刻重探 direct；如果 direct 仍健康，业务继续跑 direct。
3. Signaling socket 断线 → 永久指数退避 + jitter；peer 保留。
4. ICE `disconnected/failed` → `restartIce()`；DataChannel/PeerConnection identity 保留。
5. Hub 重启 → bridge 不销毁；RPC 读取最新 Hub client，不可用时返回 `hub_paused`。
6. Broker 明确 `bye pairing_unavailable` / token invalid / expired → 退出到重新扫码。

UI 不根据 broker socket 片段状态切全屏 boot。已进入 workspace 的 guest 只显示 compact reconnect notice。

## 安全模型

- QR 中只有一次性 ticket，不含长期 Hub token。
- 首次 claim 后 ticket 作废，guest token 绑定 pairing。
- Reconnect 走 challenge + device proof；设备私钥不可导出，保存在浏览器安全存储/IDB。
- PWA handoff ticket 一次性、短 TTL、启动后 scrub URL fragment。
- PWA manifest 恢复 cookie 只用于启动入口识别，生产必须用稳定 `PAIRING_MANIFEST_COOKIE_SECRET` 签名；broker 重启不能让已安装入口因随机进程 secret 失效。
- `/tunnel` relay 只转发 `key` / `sealed`，broker 不看业务 payload。当前是防被动转发层读取的密文 relay；长期身份认证仍由 pairing token、device proof 和 Hub 授权链负责。
- TURN 只作为 ICE fallback；不承载业务 owner。

## 设备 presence

Scan 设备在线状态不由 broker/Hub presence 判定。桌面 Device popover 用 host bridge phase：`ready` 在线，`connecting/fatal` 不计在线。
