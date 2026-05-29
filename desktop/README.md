# Viby Desktop

`desktop/` 是 Viby 的桌面主入口。

它用原生壳托管 `viby hub`，提供常驻入口、托盘体验和单实例桌面应用。

## 用户能得到什么

- 一键启动和停止本机 hub
- 查看访问地址和登录凭据
- 在连接页切换公网访问；关闭后仍可用局域网二维码连接同 WiFi 设备
- 在配置公网 pairing broker 后，一键生成跨网络手机扫码配对二维码
- 右上角设置里检查桌面更新，并可开关启动后自动检查
- 关闭窗口后继续托盘常驻
- 重复打开时唤醒已有实例

## 产品边界

- desktop 是壳层，不是业务事实源
- 服务与会话真相仍然在 `hub + cli`
- desktop 只托管自己启动的 hub
- 真正的会话交互面继续只认 `web` / PWA；desktop 不再并行维护第二套本地 session UI

## 开发命令

```bash
bun run dev             # 仓库默认开发入口，等同 dev:desktop
bun run dev:desktop     # 桌面壳聚焦开发
bun run build:desktop   # 生产打包：harness 全量门 + sidecar + tauri build
```

`dev` / `dev:desktop` 是快路径：只编译 Rust、起前端 dev server，Hub/CLI 直接从源码运行并用 Bun watch 随源码变更重启。提交级 harness 质量门由 `build:desktop` / CI / 提交前承担，不进 dev 启动链。它要求 sidecar 文件 `src-tauri/binaries/viby-sidecar-<triple>` 已存在；首次或缺失时按报错提示 provision 一次：`bun run build:single-exe && (cd desktop && bun run prepare:sidecar)`。

源码生效边界：

- `desktop/src/**`：Vite HMR，保存后刷新 webview。
- `hub/src/**`、`cli/src/**`、`shared/**`：dev Desktop 托管的 Hub 会随 Bun watch 重启；运行中的 agent 子进程不继承已加载代码，需要新会话/重启对应子进程。
- `desktop/src-tauri/**`：Tauri dev 重新编译 Rust；壳层状态或托管 Hub 状态卡住时重开 `bun run dev`。
- 已打包 `.app` / release：只读内置 sidecar，不读工作区源码。

如需单独运行 Tauri：

```bash
cd desktop
bun run tauri:dev
bun run tauri:build
```

## 继续阅读

- 仓库入口：`README.md`
- 系统架构：`../docs/architecture/system-overview.md`
- Desktop 边界：`AGENTS.md`
- Desktop UI 壳层：`../docs/development/desktop-ui-shell.md`
- 发布与更新：`../docs/deployment/release-distribution.md`
