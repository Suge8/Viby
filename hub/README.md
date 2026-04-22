# Viby Hub

`hub/` 是 Viby 的控制面。

它把本机运行中的代理服务成一个可远程访问的产品入口。

## 用户能得到什么

- 提供 Web / PWA 使用的 HTTP API
- 提供 Socket.IO realtime
- 保存会话、消息、本机 runtime 和团队数据
- 承接 CLI / runner 上报的状态与消息
- 提供远程创建会话、文件、终端和推送能力
- 在配置 `PAIRING_BROKER_URL` 后提供公网扫码配对入口

## 产品边界

- `hub` 是控制面，不是 UI
- `hub` 负责连接和数据，不负责前端交互呈现

## 启动

```bash
viby hub
```

可选公网配对配置：

```bash
PAIRING_BROKER_URL=https://pair.example.com
PAIRING_CREATE_TOKEN=replace-me
viby hub
```

## 继续阅读

- 仓库入口：`README.md`
- 系统架构：`../docs/architecture/system-overview.md`
- 实时恢复：`../docs/architecture/realtime-recovery.md`
- Hub owner 约束：`../docs/development/hub-owners.md`
