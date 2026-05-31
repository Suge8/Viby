# Pairing Broker 与 Tunnel v2

## 目标

Broker 只解决“公网配对 + relay/tunnel + WebRTC signaling”。业务事实源仍在用户本机 Hub；broker 不保存 session/message，不拥有业务状态。

## 角色

- `desktop`：发起 pairing、展示二维码/配对码、持久化 host pairing、运行 host bridge；启动时必须先刷新持久化 broker pairing，确认 host token / session stale 后在本地清理，避免无效历史绑定继续占用 relay / signaling 连接。
- `hub`：本机事实源；session、message、machine、device auth 都由 Hub owner 写入。
- `web/PWA`：扫码/恢复后作为 guest，先走 relay tunnel，可用后并发尝试 direct。
- `pairing broker`：verify-code、token、challenge、PWA handoff、ICE server 配置、WebSocket signal forward、opaque tunnel frame forward。

## Broker 状态

Broker session state 收缩为：

- `active`
- `deleted`
- `expired`

Broker 不维护 connected/ready/peer-left 业务状态。WebSocket 在线只是转发条件，不是 durable truth。

## Socket contract

`/pairings/:id/ws` 客户端只允许 WebRTC signal：

- `description`
- `candidate`
- `bye`

Broker 不接受客户端控制帧；`peer-replaced` 这类旧 guest-token 旋转控制主路径已删除。PWA handoff / reconnect 只新增 `RemoteConnection`，host 通过 tunnel peer key / heartbeat 事件重建需要的 direct 探测。

`/pairings/:id/tunnel` 只允许 broker 可见的 `PairingTunnelRelayFrame`：

- `key`
- `sealed`

`key` 是端点临时 ECDH 公钥，`sealed` 是 AES-GCM 密文。端点解密后才会得到本地 `message` / `binary` / `heartbeat` / `heartbeat-ack` plain frame。Broker 验 token/role/pairing 后只转发 opaque relay frame，不解析业务 payload。

`/ws` 为 attach 竞态保留每个目标角色最多 128 条内存中的早到 signal，晚到 peer 接上即 flush；这只覆盖 offer/candidate 时序，不是 durable history。`/tunnel` 不缓存业务 frame，不补发历史消息。因为 tunnel 不缓存，端点收到对端 `key` 后会重发本端 `key`，修复 host 先打开、guest 后 attach 时的 key 丢失竞态。

Pairing 不使用 Socket.IO：`/ws` 和 `/tunnel` 都是 broker 的原生 WebSocket upgrade。Socket.IO 只属于 Hub realtime / terminal / CLI namespace，不参与 pairing WSS relay。

## 传输层设计

Tunnel v2 的主规则：

1. WSS relay tunnel 先连接，`WebSocket/TLS` 打开且 ECDH key exchange 完成后只算通道可发送；收到带兼容 `protocolVersion` 的 Peer heartbeat ACK 后才进入业务可用态。
2. WebRTC 并发探测；direct DataChannel 的业务 heartbeat ACK 是可用性事实，selected candidate 为 `host/srflx/prflx` 时补充记录候选类型；浏览器未暴露 candidate stats 时，只要 direct heartbeat 证明健康，也升级为 `direct-webrtc`。
3. selected candidate 明确为 `relay` 时不叫 P2P，标记 `turn-candidate` 并继续 WSS relay。
4. `direct-webrtc` stale、close、missed ACK 达预算时退回 `relay-wss`；WSS relay 保持 standby。
5. route 状态只认 `shared/src/pairing/pairingTunnelRoute.ts` reducer；Web / Desktop / broker 不再各自猜测 active route。
6. `/ws` 继续只做 WebRTC signaling，`/tunnel` 只承载 sealed relay frame；Peer RPC / sync event / terminal event 都在端点内加密后进入 relay。

Route reducer 带事件驱动滞后：第一次 direct 只需少量 ACK 即可从 relay 升级；direct 失败或 missed ACK demote 后，下一次升级需要更多 ACK；direct 探测 RTT 不覆盖当前 active relay RTT，避免 UI 显示和路由状态裂开。当前产品策略是 P2P-preferred：DataChannel heartbeat 已经往返就算 direct 可用证明，candidate stats 只负责补充 host/srflx/prflx 观测或明确否决 relay candidate；非 P2P 统一留在 WSS relay。

Relay active 时也要主动争取 direct：relay open、relay heartbeat ACK、foreground pulse 都会在当前不是 `direct-webrtc` 且没有 direct probe 运行时触发一次 ICE restart。Relay heartbeat ACK 是 active relay RTT 的事实源，避免 UI 长期停在“测速中”。Direct 首个 ACK 后如果 reducer 仍缺少 ACK 证明，移动端立即发下一次 probe ACK，不等 15s steady keepalive；WebKit/Safari stats 透明度差时也能快速升级。Peer heartbeat 带 `id/sentAt/ack`，两端只把 `ack=true` 当作 RTT 样本，普通 heartbeat 只回 ACK，避免双向保活互相误判。这里不是第二套路由控制器；heartbeat 是 NAT keepalive + 观测，route 决策仍只进 reducer。

PWA handoff / device reconnect 不替换授权设备，只新增远端连接 token；旧 tab 与新 PWA 可同时存在。Desktop bridge 在已 ready 的 relay tunnel 收到新 peer key 时触发 direct 重建，同事务 demote direct、关闭旧 DataChannel/RTCPeerConnection、创建新 peer 并重新发起 direct probe；relay 继续保持可用，直到新 direct 通过 heartbeat ACK 后再升级。

Desktop host bridge 也消费同一 reducer：`RTCPeerConnection` 不存在或 direct signaling 失败时，Desktop 仍然通过 relay tunnel 进入 ready，不再把 WebRTC 当成可用性的前提。WebRTC selected candidate 非 relay 时才显示“点对点直连”；selected candidate 是 relay 时显示“安全中转”，内部仍保持 `activeTransport='relay-wss'`。

`shared/src/pairing/createPairingTransport` 仍是 WebRTC direct adapter：

1. 长寿命 `RTCPeerConnection`。
2. 短寿命 signaling socket，可重连/替换。
3. W3C Perfect Negotiation 处理 offer glare。
4. ICE candidate 早到时排队，remote description 落地后 flush。
5. ICE restart 由 transport 层触发；不是 broker 业务状态。
6. DataChannel 只作为 WebRTC route，不再是可用性的前提。
7. `RTCPeerConnection` 配置只设 `bundlePolicy: 'max-bundle'` + `iceServers`；**不设 `iceCandidatePoolSize`**。非 0 的 pool 会让 WebKit / Chromium 在 `setLocalDescription` 之前就预 gather candidate，那时还没 datachannel / m-line / 真实 ufrag，pool 里的 STUN/TURN candidate 会与 mDNS 匿名化的 host candidate 混合分配到 component，对端验证 ufrag 不一致 → ICE check 全部失败 → datachannel 永不 open → 用户看到的 “安全中转” 是 sealed WSS 兜底。`pairingTransportDefaults.test.ts` 锁住这个选择。

Peer RPC / sync / terminal 文本帧走 `shared/src/pairing/pairingPeerTextFrame.ts` 单一 owner：DataChannel 按 RFC 8831 建议把编码后 frame 控制在 16KiB 内（当前 11KiB 原始 payload → base64 JSON frame），发送端通过 `bufferedAmountLowThreshold` 做背压，并用 urgent / interactive / bulk 优先级队列让 heartbeat / 错误 / 小交互不被大响应长期压住；接收端重组后再进原 RPC parser，且只保留有限个未完成 chunk message，超额丢最旧半包，防异常 peer 用半包撑内存。WSS relay 仍可直接承载 sealed text frame。远程列表 payload 只发卡片所需 presentation 字段并裁剪超长 path / summary；远程 `session.open` / `session.resume` 请求带 `includeLatestWindow: false` 时只返回 session head，首屏/历史消息统一走 `session.messages` / `session.load-after`，WebRTC 和 WSS 使用同一 Peer RPC 合同；`session.messages` 从 protocol v2 起是远程消息窗口必需能力，旧 peer 在 heartbeat compatibility 阶段直接提示更新，不等业务 RPC timeout。未带 `includeLatestWindow` 的旧 Web 仍收到完整 `SessionViewSnapshot`。Web 侧记录每次 Peer RPC 的 method / route / bytes / chunks / duration / timeout，右下角徽章保留链路 RTT，同时用 locale 文案显示最近一次业务 RPC 诊断，避免把 heartbeat RTT 误当成打开会话耗时。

会话 lifecycle 控制不是传输健康探针。`session.close` / `session.archive` / `session.abort` / `session.unarchive` 属于幂等控制 RPC：active route 是 direct 时先走 direct，direct send/response 失败后用新 request id 通过 WSS relay 重试一次；`session.send` 不重试，避免重复消息。Hub 收到 `close/archive` 后先提交 durable lifecycle，把卡片移出运行区，再用短超时请求 runner teardown；teardown 失败不得把已提交 lifecycle 回滚成 running/open，迟到 keepalive 也被 history lifecycle 拦下。

Binary upload 同时走两条 route，由 `web/src/remote/remotePairingBinaryUpload.ts` 选发：优先 datachannel 发 `createPairingUploadChunkFrame` magic 帧；channel 不可用时走 sealed relay 发 `PairingTunnelBinaryFrame`，desktop relay bridge 重建同一 magic 帧然后复用 `PairingBinaryUploadManager.accept`。上传不再要求 P2P 升级成功，relay-only 路径也能成包。

这里不内嵌 NetBird / WireGuard，也不把 Go QUIC / WebTransport 当当前 direct P2P 主路径：手机端仍是 Web/PWA，浏览器不暴露通用 UDP/WireGuard socket；WebTransport 是浏览器到 HTTP/3 server 的 client-server transport，不是 browser-to-desktop P2P socket。当前最佳路径就是 sealed WSS relay 先可用、WebRTC P2P direct 成功后升级。

Native desktop UDP/QUIC host 已从当前移动 Web 产品路径裁掉：只替换桌面一端不能让手机浏览器绕开 WebRTC，反而会复制一套 transport/bridge owner。只有当手机端变成 native app，或真实 harness 证明桌面 WebView WebRTC 是主要失败源时，才重新引入 native direct adapter；即便引入，也必须继续消费同一条 route reducer。

## 网络验收矩阵

Tunnel v2 的链路测试分三层，不把本地模拟当公网结论：

- `harness:pairing-netem`：本机 broker + 两个 Docker endpoint，用 `tc netem` 注入延迟、抖动、丢包、短暂 100% blackhole 和 degraded cellular 恢复；用于稳定复现 relay / sealed frame / handover 回归。
- `harness:pairing-prod-relay`：两个 Docker endpoint 都连 `https://pair.viby.run`，验证生产 TLS、反代、broker、sealed relay 和公网 RTT。
- `harness:pairing-prod-local-direct-webrtc`：两份本机 Chromium 通过生产 `/ws` signaling 建 WebRTC DataChannel；这是生产 broker 信令 smoke，不代表真实 NAT。
- `harness:pairing-remote-nat-direct-webrtc`：本机 Chromium host + 远端 SSH runner 上的 aiortc guest 通过生产 broker 信令，要求 DataChannel ACK 成功且本机浏览器 selected ICE candidate 不是 relay；这是排查真实公网 P2P 的诊断线，不作为默认产品可用性门。

`harness:verify:tunnel` 会自动租用 Docker runtime；Docker 不可用且本机有 Colima 时会自动启动 Colima，并只在本次 harness 启动了 Colima 时负责关闭它。真手机蜂窝/Wi-Fi handover 仍需要真机矩阵；自动化只能覆盖可重复的网络损伤和跨公网 direct。端到端测量页建议优先复用服务器 + 桌面浏览器 responder，避免改动主业务代码。

调研依据：

- MDN WebRTC API：浏览器原生支持 peer-to-peer `RTCPeerConnection` / `RTCDataChannel`。
- MDN WebTransport API：WebTransport 让 user agent 连接 HTTP/3 server，提供 client-server streams/datagrams。
- Socket.IO WebTransport docs：WebTransport 是 Socket.IO 的 client-server low-level transport；Node 示例需要 HTTP/3 WebTransport server 把 session 转交给 Engine.IO，不能替代 WebRTC P2P。
- Socket.IO Bun engine 0.1.0：当前只实现 `polling` / `websocket`，没有 `webtransport` server transport。
- Tailscale connection types：所有连接先经 DERP relay 建立可达性，再尝试升级 direct；失败继续 relay，并周期性重试。
- NetBird docs：NetBird 用 WireGuard + Pion ICE + Coturn/Relay，ICE 选 host/srflx/prflx/direct，relay 是兜底；这适合 native agent/VPN，不适合只内嵌到手机 Web。

Peer 只有 `connectionState='closed'` 时才重建；网络切换、息屏、broker 重启走同一 peer 的 ICE restart / signaling reconnect。

## 恢复策略优先顺序

1. 页面 foreground pulse → 立即唤醒 signaling 并触发 transport reconnect。
2. Relay tunnel ready/heartbeat → 如果当前仍走 relay，立刻重探 direct；如果 direct 仍健康，业务继续跑 direct。
3. Signaling socket 断线 → 永久指数退避 + jitter；peer 保留。
4. ICE `disconnected/failed` → `restartIce()`；DataChannel/PeerConnection identity 保留。
5. Hub 重启 → bridge 不销毁；RPC 读取最新 Hub client，不可用时返回 `hub_paused`。
6. Broker 明确 `bye pairing_unavailable` / token invalid / expired → 退出到重新扫码。终态判定由 `shared/src/pairing/pairingCloseCode.ts` 的 `classifyFatalPairingClose()` 单一拥有：desktop relay bridge、web relay socket、direct `/ws` transport 共用同一规则（`1008 invalid_token` / `1012 replaced` / 任一 `PairingByeReason`），命中即终态、停止重连，desktop 侧并丢弃被拒配对，避免失效 host token 反复重连饿死新扫码。

UI 不根据 broker socket 片段状态切全屏 boot。已进入 workspace 的 guest 只显示 compact reconnect notice。

## 安全模型

- QR 中只有 `pairingId`，不含一次性 ticket 或长期 Hub token。
- 首次 verify-code 成功后，guest token 绑定 pairing。
- Reconnect 走 challenge + device proof；设备私钥不可导出，保存在浏览器安全存储/IDB。
- PWA handoff ticket 一次性、短 TTL、启动后 scrub launch query。
- PWA manifest 恢复 cookie 只用于启动入口识别，生产必须用稳定 `PAIRING_MANIFEST_COOKIE_SECRET` 签名；broker 重启不能让已安装入口因随机进程 secret 失效。
- `/tunnel` relay 只转发 `key` / `sealed`，broker 不看业务 payload。当前是防被动转发层读取的密文 relay；长期身份认证仍由 pairing token、device proof 和 Hub 授权链负责。
- relay candidate 只作为 direct 探测失败原因；业务中转 owner 仍是 sealed WSS relay。

## 设备授权与在线状态

Pairing broker 只保三类 owner：

- `PairingInvite`：一次性邀请、二维码、短码生命周期；当前存储形态是 `PairingSessionRecord` 的 invite 字段（id/state/shortCode/expiresAt/host）。
- `AuthorizedDevice`：授权设备身份，持有 `id/publicKey/label/metadata/authorizedAt/lastSeenAt`；verify-code 唯一写入，PWA handoff / reconnect 不替换它。
- `RemoteConnection`：实时连接实例，持有 `connectionId/tokenHash/deviceId/channel/connectedAt/lastSeenAt`；浏览器刷新、PWA handoff、device reconnect 只新增连接 token；当前在线事实来自 sealed tunnel，`channel='tunnel'`。

公开合同：

- `PairingSessionRecord.guest` 已退出存储 owner；对外 snapshot 里的 `guest` 只是由 `authorizedDevice` 派生的 UI 快照。
- `GET /pairings/:id` 返回 `{ pairing, remoteConnections }`。
- host SSE `pairing.updated` 返回 `{ type, pairing, remoteConnections }`，verify-code、PWA handoff、guest socket attach/detach 都推进同一合同。
- `approvalStatus === 'approved'` 只表示授权完成；在线状态只看 `remoteConnections.connectedAt`。
- SSE 指名不开 `proxy_buffering`：broker `/pairings/:id/events` 头 `X-Accel-Buffering: no` + `Cache-Control: no-cache, no-transform`。反代层需 honor 该提示。
