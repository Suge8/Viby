# Viby Desktop

`desktop/` 是给 `viby hub` 套的一层原生桌面壳。

最后检查：`2026-03-24`

它只负责几件最基本的事：

- 启动和停止 hub
- 显示访问入口、监听地址和访问密钥
- 提供托盘常驻体验：关窗隐藏，Dock 或托盘都能重新唤醒窗口
- 保持单实例：重复打开时只会唤醒已有窗口，不会再起第二个桌面壳

## 架构

```text
Tauri shell
  ├─ React status panel
  ├─ Rust supervisor + tray
  └─ viby hub sidecar
```

桌面壳不重写 hub 业务逻辑。  
真正的服务事实源仍然在 `cli + hub`，桌面层只负责进程托管和状态展示。

当前桌面状态链已经收口为：

- Rust supervisor 负责统一读取 `managed_pid`、`hub.runtime-status.json` 和启动配置
- supervisor 产出单一 canonical snapshot，并通过 Tauri event 推给前端
- React 面板只做首次 `get_hub_snapshot` 和后续 event subscription，不再固定轮询
- 面板与托盘打开入口统一复用 `open_preferred_url`，不再保留前端任意 URL 打开分支

补充说明：

- 桌面壳默认和 CLI 共用同一套 `~/.viby`
- 桌面壳永远只托管自己启动的 `viby hub`
- 如果默认端口被占用，hub 会自动切到空闲端口，并把新端口写回 `~/.viby/settings.toml`
- 入口模式只保留两档：`仅本机` 用 `127.0.0.1` 启动，`局域网` 用 `0.0.0.0` 启动
- 显式退出应用或点击“停止中枢”时，会把桌面壳启动的 hub 一起停掉，避免 lingering hub / runner
- 如果 `hub.runtime-status.json` 还在但对应进程已经退出，桌面壳会把它归一成已停止状态，不再误判成“桌面托管中”
- 本机连接生命周期继续归 hub 管，不再让子进程自己热重启自己

## 开发

1. 根目录安装依赖：

```bash
bun install
```

2. 如需单独重生成图标：

```bash
cd desktop
bun run prepare:icons
```

这一步会从 `branding/logo.png` 生成 `desktop/src-tauri/icons/*`。
它现在会统一回写 `web/public/*`、桌面 bundle icon 和 tray 资源；
也可以直接在仓库根执行 `bun run generate:brand-assets` 单独重生成品牌资产。
后续 `tauri dev/build` 还可能更新 `desktop/src-tauri/gen/schemas/*`；
这两类都属于本地可再生生成物，仓库默认忽略。

3. 启动桌面开发态：

```bash
bun run tauri:dev
```

说明：

- `bun run tauri:dev` / `bun run tauri:build` 现在会自动先跑一次 `prepare:icons`，不再依赖手动前置步骤
- 开发态通过 `tauri.conf.json` 里的 `beforeDevCommand = "bun run dev:web"` 拉起 Vite dev server，并把窗口指向 `http://127.0.0.1:1420`
- `bun run dev:desktop` / `bun run tauri:dev` 不会先额外跑 `build:web`；只有 `tauri build` 才会执行 `beforeBuildCommand = "bun run build:web"` 并消费 `desktop/dist`
- 开发态默认直接拉 `bun src/index.ts hub`
- 发布态改为拉打包后的 `viby` sidecar
- 桌面壳默认与 CLI 共用 `~/.viby`
- 未运行时，右上角入口模式切换会即时预览下一次启动的地址；运行中则固定显示真实运行地址与真实端口
- 启动时沿用现有 `settings.toml` 里的 token；若默认端口冲突会自动改写成新的空闲端口
- hub 运行态会写到 `~/.viby/hub.runtime-status.json`
- 桌面壳拉起 hub 的 stdout / stderr 会写到 `~/.viby/logs/desktop-hub.log`
- Tauri command 权限已显式收口到桌面控制面实际需要的最小集合；未使用 command 会在 build 时剔除

## 构建

先在仓库根构建 sidecar：

```bash
bun run build:single-exe
```

然后准备 sidecar 并打包桌面应用：

```bash
cd desktop
bun run prepare:sidecar
bun run tauri:build
```

当前构建目标默认只产出 macOS `.app`。
这里刻意不再额外封装 `.dmg`，避免把不稳定的磁盘镜像脚本继续带进日常构建链。
