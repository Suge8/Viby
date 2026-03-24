# Viby

`Viby` 是一个本地优先的 AI 编码代理远程控制平台。
它把 `Claude Code` 和 `Codex` 收到同一套工作流里：会话始终跑在你的机器上，Web / PWA 负责远程查看、发消息、审批权限、浏览文件和打开终端；`desktop/` 则提供一个原生常驻壳来托管 hub。

最后检查：`2026-03-24`

## 先看哪里

- 想先跑起来：直接看下面的 `快速开始`
- 想看模块边界：先看本文的 `架构`
- 想做具体模块开发：继续看 `cli/README.md`、`hub/README.md`、`web/README.md`、`desktop/README.md`

## 核心特点

- **本地原生**：代理不迁走，仍然运行在你的电脑上。
- **远程接力**：终端、浏览器、手机围绕同一会话协作。
- **统一入口**：Claude / Codex 共用一套 CLI / Hub / Web。
- **provider 边界冻结**：`Claude Code / Codex` 是核心产品线；`Gemini / Cursor Agent / OpenCode` 继续保留为实验适配，但共享 bootstrap / lifecycle / config 边界，不再各自平行长一套控制面。
- **轻量稳定**：Hub 基于 SQLite、HTTP API 与 Socket.IO，部署面小，状态面清晰。
- **运行态边界清晰**：Hub 现在拆成“稳定进程壳 + 可热替换 runtime core”；进程只负责配置、监听口、socket 宿主和信号处理，业务同步逻辑可以独立重建。
- **生命周期清晰**：Hub 负责它拉起的 runner 与会话；实时重连只恢复连接，不会替你偷偷续发消息。
- **跨重启恢复更可靠**：Web 和 CLI 的 reconnect 主路径统一为 `snapshot + afterSeq catch-up`；`Socket.IO connectionStateRecovery` 只负责短暂断线补 realtime，不再被当成跨重启业务恢复协议。
- **会话配置可持久恢复**：session 的 `permission mode` / `collaboration mode` 已落到 Hub SQLite，不再只挂在内存 keepalive 上；重启 hub、重开终端或 runner 接管后，恢复链会继续带回这组配置。
- **恢复语义同步闭环**：`POST /api/sessions/:id/resume` 现在只会在“旧 agent thread 已重新接回”后返回成功；Hub 不再先看 keepalive 活跃就抢跑判定，Codex remote 也不再保留“启动先假成功、首轮再偷偷补 resume”的分叉。
- **会话提交链单一**：`spawn / resume / archive / close / unarchive / live config` 这些会改变会话事实的操作，都会由 Hub 返回 authoritative `session` snapshot；Web 直接写回 detail + list cache，不再依赖 `invalidate + refetch` 补偿。
- **显式恢复更稳**：`closed` 会话只有在用户显式发送消息或上传附件时才会触发恢复；聊天页只保留 route-local 的轻量 `resuming` 状态，页面重连不会偷偷续跑。
- **删除清理单点收口**：删除会话后的 detail cache、list summary 和 message window 统一走同一条 client-state cleanup helper，不再在 mutation、realtime 和视图层散写第二套清理逻辑。
- **聊天历史更稳**：线程历史按钮统一走 `上一条你发的消息 / 更多消息` 双模式；prepend 历史页时保持当前 viewport anchor，不再因为补历史把视角抖乱。
- **会话收纳更清楚**：运行中、已关闭、已归档是三种明确状态；已关闭可继续，已归档会移出主列表但仍可恢复。
- **运行中列表更稳**：会话卡片在处理中只更新内容，不会因为中途权限/工具/控制面事件反复换位；只有进入或离开运行态时才会重排。
- **远程创建会话**：Hub 启动后会自动把当前机器接入，Web 端可直接发起新会话。
- **新建会话更顺手**：启动设置会记住上次选择的代理、模型、思考强度、会话类型和 YOLO；目录输入保持单一事实源，项目选择器只负责回填最近路径、已知项目和远端目录浏览结果。
- **按页加载**：Web 把聊天、新建会话、设置、文件、终端拆成独立切块，默认首屏只拉 sessions 壳层。
- **统一输入面板**：发送/终止、附件与 controls 入口都收拢到同一 composer；模型、推理强度、权限和协作等 live config 统一进 controls 面板，移动端和桌面端行为一致。
- **消息层次更清楚**：用户消息使用更明显的品牌色气泡，AI 回复保持轻量透明 surface；文本 AI 回复即使包含 reasoning 也可直接点击复制，复制成功只保留轻量色彩反馈并沿现有 floating notice 提示；局域网 / HTTP 开发环境下也会走兼容复制路径，而且不会把复制内部焦点切换污染聊天视口。
- **Codex 回复实时可见**：remote Codex assistant 正文现在走 transient streaming；reasoning 仍保持 final-only，durable transcript 继续沿 `snapshot + afterSeq catch-up` 主路径，不会把 token chunk 落库成碎片消息；线程只会在 viewport 仍 pinned 到底部时继续跟底，用户手动上滑后不会再被 streaming 抢回滚动权。
- **手机端更像原生**：PWA 安装提示统一复用产品 icon 体系；iOS 手动安装引导和 Chromium 安装入口共用同一条 UI / i18n 语义；通知开关统一收口到设置页，只有用户显式开启后才会订阅 Web Push。
- **桌面键盘更稳**：聊天输入框默认 `Enter` 换行、`Cmd/Ctrl+Enter` 发送；IME 选词期间不会误发消息。
- **输入状态更稳定**：composer 草稿按 session 做本地持久化，只在初始化时恢复一次；发送后或手动清空后不会再被旧草稿反向回填，默认 24 小时 TTL 到期会自动清理。
- **会话内热切换边界清晰**：live model / effort 现在对 remote Claude 和 remote Codex 暴露，并统一从下一轮 turn 生效，不会追溯改正在执行的当前轮次。
- **首轮更快**：Codex remote 会预热 app-server thread，首轮不再为了自动命名额外起标题桥。
- **桌面常驻**：Tauri 桌面壳始终托管自己启动的 hub，显示入口和 key，并在关窗时缩到托盘。

## 快速开始

```bash
# 1. 启动 hub
npx @viby/cli hub

# 2. 打开 Web / PWA
#    然后从新建会话流程里创建会话
```

首次启动后，`Viby` 会把访问令牌写入 `~/.viby/settings.toml`。
终端会打印访问地址和二维码，手机打开后即可登录。

当前 SQLite schema 版本为 `8`。
当前构建会在启动时自动执行 **`v7 -> v8`** 升级，把 `sessions` 表补齐
`permission_mode / collaboration_mode` 两个 durable config 列。
更老的 schema 仍然不在自动迁移范围内；升级前依旧建议先备份 `~/.viby/viby.db`。

如果要让手机通过局域网或 Tailscale 直连这台电脑上的 hub，可把
`~/.viby/settings.toml` 里的 `listen_host` 设为 `0.0.0.0`，然后直接打开
`http://<电脑的局域网或 Tailscale 地址>:<listen_port>`。这种同源访问会直接复用
当前页面 origin，REST API 和 realtime 都走同一地址，不需要额外再配一套前端地址。

## 架构

```text
Desktop shell -> Hub sidecar
CLI(agent) --Socket.IO--> Hub(SQLite + API + Socket.IO) --HTTP/Socket.IO--> Web/PWA
```

- `cli/`：命令行入口、代理封装、本机连接、诊断
- `desktop/`：Tauri 原生桌面壳、托盘、sidecar 管理
- `hub/`：HTTP API、Socket.IO、SQLite、推送
- `web/`：React PWA，负责远程控制与文件/终端视图
- `shared/`：跨端类型、schema、协议定义

## 本地开发

启动 CLI ：

```bash
bun install
bun run dev
```

远程盯 UI 变化时，优先使用：

```bash
bun run dev:remote
```

这条链路会：

- 让 `web/` 保持 Vite HMR
- 让 `hub/` 默认以稳定模式运行，不再跟 HMR 连坐
- 在 `VIBY_REMOTE_HUB_WATCH=1` 时复用同一套 runtime core，通过 `bun --hot + server.reload()` 原地替换 HTTP/runtime，而不是整进程硬杀重启
- 让 hub 管理的本机 runner 在首次启动失败或后续异常退出时自动重试，不再一断就整条链直接带死
- 自动放行当前机器可访问地址上的 `5173` 开发页到 `37173` hub 的跨源访问
- 这条 `5173 -> 37173` 开发链同时覆盖 REST + Socket.IO；Hub 侧 CORS method 必须和真实 API 路由保持一致，包含 `PATCH` / `DELETE`，否则会出现“同样的会话操作在 37173 同源能用、在 5173 dev 页失效”的假分叉
- 明确区分 `5173` 与 `37173`：`5173` 只负责 Vite 开发页，`37173` 才是 hub / API / realtime / 静态托管入口
- 日常前端联调默认只进 `5173`；`37173` 只作为 hub 直连 / 静态入口 / 更接近生产态的调试面，不再把两个入口混成一个“都能改前端”的心智
- 如果你当前打开的是 `37173`，Web 改动要先 `bun run build:web`；这条静态入口在开发态消费的是 `web/dist`，不会像 `5173` 一样直接吃 HMR
- `37173` 的 static boot recovery 现在只会对带明确 `/assets/` 证据的早期失败做一次 reload；普通启动异常不应再被误刷成无限“恢复刚才的会话”
- Web 构建侧当前仍保留少量已显式验证过的 runtime chunk 切口，具体以 `web/vite.config.ts` 为准；新增或调整手工切块前，先确认 static 入口不会重新引入 production-only 初始化环依赖
- 默认复用 `~/.viby`，这样远程开发态会继续使用你平时那套 token 和本地配置

为了避免手机/PWA 挂在旧壳上，本地、局域网、Tailscale 和 `.local` 这类开发 origin
默认不会注册 service worker；`/`、`/sw.js`、`/manifest.webmanifest` 也会走
`no-cache`，只有 `/assets/*` 继续走 immutable 长缓存。

PWA 通知只在正式的非本地 `https` 入口上开放：

- Android 走标准 Web Push
- iPhone / iPad 需要先把 Viby 加到主屏幕，再从设置页显式开启通知
- 登录后不会再自动弹通知权限；已授权设备只会静默校验并补齐订阅

默认推荐直接打开脚本启动后打印出来的地址，例如：

```text
http://<你的局域网或 Tailscale IP>:5173
```

远程 dev 页现在会默认按当前打开的 hostname 直连同主机的 `37173` hub，
不再依赖 `?hub=` 才能避开 Vite proxy。
只有你要临时覆盖到另一台 hub 时，才需要显式带 `?hub=http://<目标地址>:37173`。
如果你的目标是调 Web 交互与样式，默认一直留在 `5173` 即可；
只有你要验证静态入口、同源部署或非 HMR 行为时，才切到 `37173`。

登录时填的是 `CLI_API_TOKEN`，不是网站密码。
如果 Safari / 密码管理器反复把旧凭据自动填回远程 dev 页，优先清掉这个 origin
对应的已保存密码 / Autofill 项，而不是只清普通缓存。

如果你这次也要联动调试 hub 源码，可以临时启用：

```bash
VIBY_REMOTE_HUB_WATCH=1 bun run dev:remote
```

这会让 `hub` 在相关源码变更时触发一次 runtime reload，realtime 可能跟着短暂断开。
当前实现已经改成“进程保活、runtime 原地重载”，所以正常改 `hub` 源码时不该再把整个持 socket 进程杀掉；
若你仍看到整进程退出，优先排查 fatal error，而不是把这种现象当成 dev watch 的正常语义。
在这种模式下，偶发 1 到 2 条 Vite `ws proxy ECONNRESET` 属于 hub reload 窗口内的正常现象；
但如果持续刷 runner 指数退避重试，就不是正常抖动，说明 hub 没有正确接住本机 runner。
如果你已经升级到当前 dev 页实现，正常远程访问默认不会再经过 Vite proxy；
仍然看到这类日志，多半说明浏览器还开着旧页面或旧构建。

当前实现里，如果旧 runner 仍在运行且安装戳一致，新 hub 会直接复用旧 runner；
新的探测进程会以 `exit(0)` 退出，这不再被当成启动失败。
复用成功后，hub 仍会继续监督这台 machine：不只是看 `runnerState` / online，
也会按本机 PID 存活探测 reused runner；因此即便 runner 被硬杀、machine 还没来得及
超时下线，hub 也会尽快自动重新接管。

默认 `dev:remote` 会固定占用 `5173`，端口被占用时直接失败，保证远程地址不漂移。
如果你这次更在意“本机先跑起来”，也可以临时允许 Vite 自动换端口：

```bash
VIBY_REMOTE_STRICT_PORT=0 bun run dev:remote
```

这时终端会打印真实端口；你需要手动改远程访问地址。

如果你就是想把远程开发态和日常数据隔开，也可以显式启用隔离目录：

```bash
VIBY_HOME=.viby-devremote bun run dev:remote
```

相对路径现在会先按仓库根目录解析成绝对路径，再统一传给 `hub` / `web` / `runner`；
不会再因为子进程 `cwd` 不同，把同一个 `.viby-devremote` 漂成多份互不一致的 settings / token / db。

这时会生成一套独立的 `CLI_API_TOKEN`。如果登录时报 `401 auth failed`，优先检查
`.viby-devremote/settings.toml` 里的 token，而不是继续拿 `~/.viby/settings.toml` 那套旧 token 去登。

移动端附件这条链现在也统一走运行时安全的本地 ID 生成，不再假设所有 iPhone/PWA
环境都提供 `crypto.randomUUID()`；因此选图后的预览、上传和发送会共用同一条附件语义。

启动桌面 APP ：

```bash
bun run dev:desktop
```

这条开发链路会走 `tauri dev + vite dev server`，不会额外先做一次前端 production build。
`bun run build:desktop` 会先跑根仓的 `build:single-exe`，为 hub sidecar 准备内嵌的 `web/dist`，
再进入 `desktop` 自己的 `build:web` / `desktop/dist` 打包链。

桌面壳会只绑定自己拉起的 hub。
未运行时可以直接在桌面里切 `仅本机 / 局域网` 两档模式，并即时预览下一次启动地址；
运行中则固定显示真实运行地址与真实端口。
如果默认端口被占用，会自动换到空闲端口并同步到 `~/.viby/settings.toml`。

## 构建

```bash
bun run build:single-exe
```

构建桌面应用：

```bash
bun run build:desktop
```
