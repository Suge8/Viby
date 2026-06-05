# Local development commands

本地开发只认少数主入口；模块命令保留给聚焦调试、CI 和发布链。

## 主入口

```bash
bun install
bun run dev
bun run lint:fix
bun run check
bun run build
```

- `bun run dev`：默认产品开发入口，等同 `bun run dev:desktop`。Desktop UI HMR、Tauri dev、AppCore 源码 watch 都在这一条链里；首次缺 AppCore 校验二进制时按报错跑 `bun run build:app-core && bun run --cwd desktop prepare:app-core`。
- `bun run lint:fix`：提交前自动修复 touched/显式 style 文件，复用 `verify:style` 的 scope；模型写完代码先跑这一条，再跑 `bun run verify:commit`。
- `bun run check`：提交前必跑的高信号验证，等同 `bun run verify:required`。
- `bun install`：通过 Husky 安装 Git hooks；`pre-commit` 跑 `verify:commit`，`pre-push` 跑 `verify:required`。
- `bun run clean:artifacts:old`：清理重型 smoke 旧证据，默认每类保留最近 3 个；`bun run clean:artifacts` 才全删本地工件。
- `bun run build`：先跑 `verify:required`，再构建 Web / Hub / Pairing；Desktop app 单独用 `bun run build:desktop`。

## 何时不用 `bun run dev`

| 场景 | 命令 |
| --- | --- |
| 只调 Web/PWA + Hub，不开桌面壳 | `bun run dev:browser` |
| 远程联调 Web + Hub | `bun run dev:remote` |
| Pairing broker 本地调试 | `bun run dev:pairing` |
| Desktop 发布包 | `bun run build:desktop` |
| Desktop 内部 AppCore 二进制 | `bun run build:app-core` |
| Pairing 部署包 | `bun run build:pairing` |
| Desktop 发布包生命周期 smoke | `bun run smoke:desktop-lifecycle` |
| Desktop dev 生命周期 smoke | `bun run smoke:desktop-dev-lifecycle` |
| Provider 冷启动 import 计时 | `bun run audit:provider-startup` |
| AppCore 体积 / metafile trace | `bun run audit:app-core-size` |

## Dev terminal output

`bun run dev` / `bun run dev:desktop` 的终端输出只作为 action stream：入口、ready/restart/stop、Tauri/Vite/Rust 编译错误、可操作启动错误。请求追踪、心跳、pairing frame、reconnect 过程、provider stdout/stderr、成功路径检查不进终端。Desktop dev 使用 `desktop/src-tauri/tauri.dev.conf.json` 关闭 dev-only unused-command audit；发布构建仍用主 `tauri.conf.json`。

可操作错误必须写清 `ERROR / reason / fix / details`；详细证据看 `~/.viby/logs/desktop.log` 与 `~/.viby/logs/desktop-app-core.log`。完整规则见 `docs/development/dev-output.md`。

## 源码生效边界

- `desktop/src/**`：Vite HMR，保存后刷新 webview。
- `desktop/src-tauri/**`：Tauri dev 重新编译 Rust；壳层状态卡住时重开 `bun run dev`。改 Desktop 启动/生命周期时跑 `bun run smoke:desktop-dev-lifecycle`；该 smoke 会保存并扫描 Desktop stdout/stderr 与 `desktop-app-core.log`，禁止靠人工看终端发现启动错误。
- `branding/**`：手动跑 `bun run generate:brand-assets` 刷新 Web / Desktop 图标；dev 启动不重新生成品牌资产。
- `app-core/src/**`、`hub/src/**`、`shared/**`：Desktop dev 托管的 AppCore 由 Bun watch 重启。
- 运行中的 agent 子进程不继承已加载代码；改 provider runtime 后新建会话或重启对应子进程。
- 已打包 `.app` / release 只读内置 AppCore，不读工作区源码。

## 命令分层规则

- README 只暴露 `dev / check / build` 和 Desktop 产品入口。
- `dev:*` 是开发内循环。
- `lint` 只查 style；`lint:fix` 只自动修复 touched/显式文件；不得在 hook 里自动 commit。
- `verify:commit` 是提交前轻门禁：secrets + style；Agent 提交前必须先跑 `lint:fix`，再跑 `verify:commit`。
- `verify:*` 是本地与 CI 共用的必过验证；只保留 secrets、format、workspace、owner/boundary、typecheck、focused tests、critical contracts。
- `typecheck:*`、`test:*` 是模块聚焦验证。
- `audit:*` 只产报告，不作为默认门禁。
- `smoke:*` 验证真实环境或高保真链路，默认手动 / nightly，不进 required gate。
- `build:*` 是产物链；带 Desktop / pairing / app-core 的命令只在对应发布场景使用。
