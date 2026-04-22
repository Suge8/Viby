# Viby

Viby 是一个本地优先的 AI 代理远程控制产品。

你的 AI 继续跑在自己的电脑上；你只需要用 `Web / PWA / Desktop` 接力查看、发消息、审批、看文件和打开终端。

当前产品已收口为 **Desktop 壳 + Web/PWA 唯一交互面**：CLI 继续负责 runtime 与本机桥接，但不再提供 Viby 自己的本地 TUI / local interactive mode。

## 它解决什么问题

- 让 `Claude Code`、`Codex`、`Pi` 跑在你的机器上，而不是迁到云端
- 让你在手机、浏览器、桌面壳之间接力同一个会话
- 把消息、权限、文件和终端能力收进一个可随身带走的远程入口

## 当前产品形态

- `desktop/`：桌面主入口，托管 hub sidecar，提供常驻壳和托盘体验
- `hub/`：本地控制面，负责设备连接、会话服务和数据落盘
- `web/`：移动优先的 Web / PWA 远程控制界面
- `cli/`：本机运行引擎，负责启动和承接各类代理
- `pairing/`：公网配对服务，负责扫码连接和远程唤起
- `shared/`：跨端共用的协议和基础能力

## 支持的代理

- 核心：`Claude Code`、`Codex`、`Pi`
- 实验：`Gemini`、`Cursor Agent`、`OpenCode`、`GitHub Copilot`

## 快速开始

```bash
# 临时运行
npx @singyy/viby hub

# 或全局安装
npm install -g @singyy/viby
viby hub
```

启动后：

1. 打开终端输出的 Web 地址
2. 用 `CLI_API_TOKEN` 登录
3. 在 Web 里新建会话

## 开发入口

- 产品总览：`README.md`
- Web / PWA：`web/README.md`
- Hub：`hub/README.md`
- CLI：`cli/README.md`
- Pairing Broker：`pairing/README.md`
- Desktop：`desktop/README.md`
- 架构与边界：`docs/README.md`

## 本地开发

```bash
bun install
bun run dev
```

常用链路：

```bash
bun run dev:remote   # Web + Hub 远程联调
bun run dev:desktop  # 桌面壳开发
bun run build:single-exe
bun run build:pairing # 生成 pairing/deploy-bundle/ + deploy-bundle.tar.gz
```

## 文档分层

- README 只回答产品是什么、怎么跑、去哪里继续看
- 复杂运行边界和恢复语义统一收口到 `docs/`
- 模块内更细的开发规则继续看对应目录下的 `AGENTS.md`
