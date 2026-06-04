# Viby Desktop

`desktop/` 是 Viby 的唯一用户入口。

它托管 AppCore，提供窗口、菜单栏常驻、更新、设置、配对和退出生命周期。用户不需要 npm、命令行 或手动启动 Hub。

## 用户能得到什么

- 打开 Viby 后后台可远程连接。
- 关闭窗口后继续菜单栏常驻。
- 重复打开时唤醒已有实例。
- 在连接页切换公网访问；关闭后仍可用局域网二维码连接同 Wi-Fi 设备。
- 一键生成跨网络手机扫码配对二维码。
- 菜单栏点“退出”时停止 AppCore、pairing bridge、runtime 和 provider 子进程。

## 产品边界

- Desktop owns AppCore lifecycle。
- AppCore 是 session / message / device / runtime status 的本地事实源。
- Desktop UI 不写业务 truth，只消费 AppCore snapshot。
- 真正的会话交互面继续只认 `web` / PWA；Desktop 不维护第二套 session UI。
- `app-core/` 不再是发布产品入口；发布版只通过 Desktop 启动内部 AppCore。

## 开发命令

```bash
bun run dev             # 仓库默认开发入口，等同 dev:desktop
bun run dev:desktop     # 桌面聚焦开发
bun run build:desktop   # 生产打包：harness + AppCore + tauri build
```

`dev` / `dev:desktop` 是快路径：Tauri + Vite HMR，AppCore 从 `app-core/src/appCoreBootstrap.ts` 源码运行并随 Bun watch 重启。Tauri 仍要求 `src-tauri/binaries/viby-app-core-<triple>` 存在用于打包校验；首次或缺失时按报错跑：

```bash
bun run build:app-core && (cd desktop && bun run prepare:app-core)
```

源码生效边界：

- `desktop/src/**`：Vite HMR，保存后刷新 webview。
- `app-core/src/**`、`hub/src/**`、`shared/**`：dev Desktop 托管的 AppCore 随 Bun watch 重启。
- `desktop/src-tauri/**`：Tauri dev 重新编译 Rust；壳层状态卡住时重开 `bun run dev`。
- 已打包 `.app` / release：只读内置 AppCore，不读工作区源码。

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
