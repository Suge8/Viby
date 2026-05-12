# Pairing Reconnection

## 协议基线

Viby pairing 使用 W3C Perfect Negotiation Pattern：双端都可发起 negotiation，glare 由 polite/impolite 规则解决。

- host：impolite
- guest：polite
- signal surface：`description | candidate | bye`
- `setLocalDescription` 显式两步：`createOffer/createAnswer` → `setLocalDescription(desc)`

参考：MDN Perfect negotiation。

## createPairingTransport 流程

```text
start
  ├─ create RTCPeerConnection
  ├─ open/reopen signaling socket
  ├─ host create DataChannel / guest wait ondatachannel
  ├─ signal description/candidate through broker forwarder
  ├─ DataChannel open + heartbeat/RPC ready
  └─ keep peer alive across socket reconnect / ICE restart
```

Transport 暴露 stable handle：`subscribe()`、`getSnapshot()`、`untilReady()`、`notifyForeground()`、`send()`、`close()`。

## 长寿命 peer / 短寿命 socket

`RTCPeerConnection` 是连接 identity。Signaling WebSocket 是易失通道。

- broker 重启：换 socket，不换 peer。
- iPhone 息屏/前台恢复：唤醒 socket，必要时 ICE restart，不换 peer。
- Wi-Fi/蜂窝切换：ICE restart，不换 peer。
- 只有 peer `connectionState='closed'` 才创建新 peer。

## ICE restart 触发链

```text
foreground pulse
socket reattached
iceConnectionState failed/disconnected
        └─ transport.restartIce()
              └─ PerfectNegotiation emits offer
                    └─ broker forwards description/candidate
```

ICE restart 属于 transport 层。`perfectNegotiation.ts` 不直接调用 `restartIce()`。

## Signal ordering

Candidate 可能早于 remote SDP 到达。Transport 负责排队：

```text
candidate before description → queue
setRemoteDescription success → flush queued candidates
```

旧 socket 的迟到 message 必须丢弃；broker 不做 durable queue。

## UI 语义

Web retained-ready 后刷新/息屏恢复不回全屏 boot：

- `hydrating`：最多短 skeleton
- `running`：workspace 保留 + compact reconnect notice
- `fatal`：不可恢复错误

Desktop scan 在线由 bridge phase 判定：`ready` 在线；`connecting/fatal` 不在线。
