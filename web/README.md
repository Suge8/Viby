# Viby Web

`web/` 是 Viby 的 Web / PWA 客户端。

它负责远程查看会话、发消息、审批权限、浏览文件、打开终端，以及在在线机器上创建新会话。

## 用户能做什么

- 查看会话列表和聊天线程
- 实时看 AI 输出
- 发送消息、附件和重试请求
- 记住当前激活会话的输入草稿
- 审批权限请求
- 浏览文件、Diff 和终端
- 在手机上以 PWA 方式使用
- 创建普通会话或 manager 会话
- 创建 `pi` 会话时，按目标机器 + 目标目录实时读取 Pi 自身模型与思考强度配置
- 记住上次成功创建会话时使用的 launch settings

## 产品定位

- 移动优先
- 本地优先：会话事实源不在浏览器，而在 `hub + cli`
- 实时优先：REST 首屏，Socket.IO 增量同步
- 轻入口：页面和工作区按需加载

## 主要页面

- `/sessions`
- `/sessions/$sessionId`
- `/sessions/$sessionId/files`
- `/sessions/$sessionId/file`
- `/sessions/$sessionId/terminal`
- `/sessions/new`
- `/settings`

## 开发命令

```bash
bun run --cwd web dev
bun run --cwd web test
bun run --cwd web typecheck
bun run --cwd web build
```

## 继续阅读

- 仓库入口：`README.md`
- Web 边界：`../docs/development/web-boundaries.md`
- 实时恢复：`../docs/architecture/realtime-recovery.md`
