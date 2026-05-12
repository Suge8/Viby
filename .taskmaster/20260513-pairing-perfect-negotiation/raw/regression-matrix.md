# 真机回归矩阵

> Phase E、F 完成后逐项跑；Phase K 收尾时全量重跑。
> 自动化测试只是保底；本矩阵每项必须人工真机或 Playwright 真实流程跑通。

## 设备 / 环境

- 桌面：macOS arm64 + Viby Desktop (Tauri)
- 手机：iPhone 16 (iOS 26) + Safari + PWA 模式（双线测）
- 网络：家庭 Wi-Fi + 5G 蜂窝
- broker：本机 dev / `pair.viby.run` 生产

## 测试用例

### RM1 — 首次扫码 + 输 6 位码

- **前置**：清空 desktop 持久化 pairing；清 iPhone IDB
- **操作**：桌面点配对 → iPhone 扫码 → 跳到配对码页 → 输入 6 位码
- **期望**：
    - 输码后 1-2s 内进入 workspace
    - 桌面 popover 显示 1 台设备 + ready 状态
    - webrtc-internals：1 个 PeerConnection、1 个 DataChannel、connected
- **fail 标志**：超过 5s、卡在"建立安全通道"、popover "暂无在线设备"

### RM2 — iPhone Safari 息屏 30s 醒来

- **前置**：已 RM1 完成
- **操作**：iPhone 锁屏 30s → 唤醒
- **期望**：
    - 顶部 reconnect notice 出现时间 ≤ 2s 或不出现
    - workspace 内容立即可见，不全屏 boot
    - webrtc-internals：**同一个** PeerConnection、**同一个** DataChannel
- **fail 标志**：全屏"正在连接你的电脑"；新 PeerConnection 创建

### RM3 — iPhone Safari 息屏 10min 醒来

- **前置**：已 RM1 完成
- **操作**：iPhone 锁屏 10min → 唤醒
- **期望**：
    - 自动 `peer.restartIce()` 触发一次
    - 同一 PeerConnection + DataChannel 保活
    - 1-3s 内 ready notice 消失
- **fail 标志**：guest 端 PeerConnection 重建；DataChannel 重建

### RM4 — iPhone Wi-Fi → 蜂窝 切换

- **前置**：已 RM1 完成，Wi-Fi 在线
- **操作**：关 Wi-Fi → 等 5s → 用蜂窝继续
- **期望**：
    - `iceConnectionState`: `disconnected` → 自动 `failed` → `restartIce`
    - 新 ICE candidate gather 完成 → 重新 `connected`
    - 同一 PeerConnection 保活，1-3s 恢复
- **fail 标志**：PeerConnection 重建；超过 10s 未恢复

### RM5 — iPhone Safari 刷新页面

- **前置**：已 RM1 完成
- **操作**：Safari 下拉刷新
- **期望**：
    - IDB hydrate workspace shell 立即可见（≤ 500ms 看到旧内容）
    - 顶部 compact reconnect notice 显示
    - 后台 reconnect 完成（≤ 3s）→ notice 消失
    - **绝不显示全屏"正在连接你的电脑"**
- **fail 标志**：全屏 boot screen 出现；超过 5s 才看到内容

### RM6 — PWA 独立模式启动（handoff ticket）

- **前置**：已 RM1 完成，从 Safari "添加到主屏幕" 装 PWA
- **操作**：杀掉 Safari + PWA → 从主屏启动 PWA
- **期望**：
    - 启动时消费 handoff ticket
    - device key 自动生成 / 复用
    - 进入 workspace ≤ 3s
    - 后续刷新走标准 reconnect，不再消费 handoff
- **fail 标志**：被踢回扫码页；handoff ticket 重复消费

### RM7 — 桌面关 Hub 5s → 开 Hub

- **前置**：已 RM1 完成
- **操作**：桌面端 toggle 关闭 Hub → 等 5s → 重新打开
- **期望**：
    - 桌面 popover **不抖**：仍显示设备在线
    - 手机端最多看到一次 compact "正在恢复" notice ≤ 2s
    - **不**全屏 boot
    - bridge phase ready 保持
    - webrtc-internals：同一 PeerConnection 保活
- **fail 标志**：popover 闪 "0 设备"；手机端进入 reconnecting state

### RM8 — broker 服务端短暂重启 10s

- **前置**：已 RM1 完成
- **操作**：本地 `kill` broker → 10s 后 `bun run --cwd pairing dev`
- **期望**：
    - 双端 signaling socket 自动重连
    - 同一 PeerConnection 触发 `restartIce`
    - 1-5s 内重新 ready
- **fail 标志**：双端进入 fatal；重扫码

### RM9 — broker 长时间不可达 60s

- **前置**：已 RM1 完成
- **操作**：本地停掉 broker → 等 60s
- **期望**：
    - guest 端持续指数退避重连，无 attempt 上限
    - 顶部 notice 显示 "正在恢复…（N 次）[停止]"
    - 用户可点 [停止] 退出重试
    - broker 回来 → 自动恢复
- **fail 标志**：guest 进入 fatal error 而非持续重试；UI 卡住无停止按钮

### RM10 — 桌面解绑设备

- **前置**：已 RM1 完成
- **操作**：桌面 popover 点 "取消配对"
- **期望**：
    - guest 端立即收到 `bye { reason: 'pairing_unavailable' }`
    - 跳转回扫码页 / 错误页
    - 桌面 popover 立即移除该设备
    - broker session DELETE
- **fail 标志**：guest 端长时间未感知；guest 继续重试

### RM11 — 同时配对 2 部手机

- **前置**：已 RM1 完成（手机 A），开始配对手机 B
- **操作**：桌面点 "再加一台设备" → 手机 B 扫码 + 输码
- **期望**：
    - 手机 A 完全不受影响（无 reconnect notice）
    - 手机 B 走标准 first-claim 路径
    - popover 显示 2 台
    - 2 个独立 PeerConnection
- **fail 标志**：手机 A 进入 reconnecting；手机 A 被踢

### RM12 — 1h 长时间运行

- **前置**：已 RM1 完成
- **操作**：保持手机不锁屏 + 桌面不操作，运行 1h
- **期望**：
    - webrtc-internals：始终是创建于 t=0 的 PeerConnection（无新增）
    - DataChannel 字节计数稳定增长（heartbeat / 业务流量）
    - 桌面任务管理器内存稳定，无明显增长
    - 浏览器内存稳定
- **fail 标志**：PeerConnection 计数 > 1；内存 leak

## 验收记录模板

```text
| RM# | 日期 | 结果 | 备注 |
|---|---|---|---|
| RM1 | 2026-MM-DD | ✅ / ❌ | 实际耗时 / 失败原因 |
```

## 数据采集要求

- 截图：每个 RM 的关键时刻 UI（成功 + 失败）
- webrtc-internals：导出 dump 文件存到 `raw/rm-NN-dump.txt`
- 控制台日志：每个 RM 全程 console，保存到 `raw/rm-NN-console.log`


## Phase K 验收记录 — 2026-05-12T20:15:00Z

| RM# | 日期 | 结果 | 备注 |
|---|---|---|---|
| RM1 | 2026-05-12 | ⏸️ 未跑 | 当前 API session 无可操作 iPhone Safari/PWA；自动化与生产 broker ready 已完成。 |
| RM2 | 2026-05-12 | ⏸️ 未跑 | 同上。 |
| RM3 | 2026-05-12 | ⏸️ 未跑 | 同上。 |
| RM4 | 2026-05-12 | ⏸️ 未跑 | 同上。 |
| RM5 | 2026-05-12 | ⏸️ 未跑 | 同上。 |
| RM6 | 2026-05-12 | ⏸️ 未跑 | 同上。 |
| RM7 | 2026-05-12 | ⏸️ 未跑 | 同上。 |
| RM8 | 2026-05-12 | ⏸️ 未跑 | 同上。 |
| RM9 | 2026-05-12 | ⏸️ 未跑 | 同上。 |
| RM10 | 2026-05-12 | ⏸️ 未跑 | 同上。 |
| RM11 | 2026-05-12 | ⏸️ 未跑 | 同上。 |
| RM12 | 2026-05-12 | ⏸️ 未跑 | 同上。 |

自动化覆盖：shared typecheck/test、pairing test、desktop typecheck/test、web typecheck/test/build、hub test、harness:check、test:scripts、line guard 全过。生产 broker 已部署并验证 `systemctl is-active viby-pairing`、本机 health、`https://pair.viby.run/ready`。
