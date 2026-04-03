# Viby Desktop

`desktop/` 是 Viby 的桌面主入口。

它用原生壳托管 `viby hub`，提供常驻入口、托盘体验和单实例桌面应用。

## 用户能得到什么

- 一键启动和停止本机 hub
- 查看访问地址和登录凭据
- 关闭窗口后继续托盘常驻
- 重复打开时唤醒已有实例

## 产品边界

- desktop 是壳层，不是业务事实源
- 服务与会话真相仍然在 `hub + cli`
- desktop 只托管自己启动的 hub

## 开发命令

```bash
bun run dev:desktop
bun run build:desktop
```

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
