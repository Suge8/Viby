# Viby

Viby 是本地优先的 AI 代理远程控制桌面应用。

你的 AI 继续跑在自己的电脑上；你只需要打开 Viby Desktop，就能从桌面、浏览器或手机 PWA 查看、发消息、审批、看文件和打开终端。

## 当前产品形态

- `desktop/`：唯一用户入口。窗口可关闭到后台；菜单栏退出会停止所有本地能力。
- `hub/`：Desktop 内部 AppCore，负责本地控制面、设备连接、会话服务和数据落盘。
- `web/`：移动优先的 Web / PWA 远程控制界面，由 AppCore 服务。
- `pairing/`：公网配对服务，负责扫码连接和远程唤起。
- `shared/`：跨端共用协议和基础能力。
- `app-core/`：迁移中的内部 runtime 代码，不再是发布产品入口。

## 支持的代理

- 核心：`Claude Code`、`Codex`、`Pi`
- 实验：`Gemini`、`Cursor Agent`、`OpenCode`、`GitHub Copilot`

## 快速开始

1. 安装并打开 Viby Desktop。
2. 桌面 App 保持后台运行。
3. 扫码连接手机 / PWA。
4. 菜单栏点“退出”时，Viby 会停止 AppCore、远程连接和本机代理子进程。

发布版不需要 npm、不需要命令行、不需要用户理解 Hub / daemon / 命令行。

## 本地开发

```bash
bun install
bun run dev      # Desktop + AppCore 源码开发入口
bun run check    # 提交前快验证
bun run build    # Web / Hub / Pairing 发布级构建
```

专项命令看 `docs/development/local-development.md`。

## 继续阅读

- Web / PWA：`web/README.md`
- Hub / AppCore：`hub/README.md`
- AppCore runtime：`app-core/README.md`
- Pairing Broker：`pairing/README.md`
- Desktop：`desktop/README.md`
- 产品官网：`site/README.md`
- 架构与边界：`docs/README.md`

## 文档分层

- README 只回答产品是什么、怎么跑、去哪里继续看。
- 复杂运行边界和恢复语义统一收口到 `docs/`。
- 模块内更细规则看对应目录下的 `AGENTS.md`。

## Credits

Viby 是从 [HAPI](https://github.com/tiann/hapi) 独立演进出的下游项目。Viby 维护自己的产品方向、发布渠道、更新元数据与分发入口：

```text
https://github.com/Suge8/Viby
```
