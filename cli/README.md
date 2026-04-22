# Viby CLI

`cli/` 提供 Viby 的本机 runtime 能力。

它是 Viby 在你电脑上的执行层，负责把代理真正跑起来，并把本机能力接到产品界面里。

## 用户能得到什么

- 启动本机 `viby hub`
- 托管 `Claude Code`、`Codex`、`Pi`、`GitHub Copilot` 等代理 runtime
- 提供认证、诊断和本机工具桥接
- 把本机会话暴露给 Web / Desktop 远程继续使用

## 常用命令

```bash
viby hub
viby mcp
viby auth login
viby auth status
viby doctor
viby runner status
```

## 产品边界

- 会话创建入口在 `web/` 和 `desktop/`
- CLI 负责运行和接线，不负责做第二个产品界面
- 首条真实用户消息的自动标题只认 CLI `ApiSessionClient` 本地生成并落 metadata；不调 AI API，也不回显成 transcript 正文
- Viby 自己的 local interactive mode / TUI 已移除；如需回到 provider 原生终端，请直接用对应 agent 的原生命令继续会话

## 继续阅读

- 仓库入口：`README.md`
- 系统架构：`../docs/architecture/system-overview.md`
- 实时恢复：`../docs/architecture/realtime-recovery.md`
- CLI 边界：`../docs/development/cli-runtime-boundaries.md`
- runner 细节：`src/runner/README.md`
