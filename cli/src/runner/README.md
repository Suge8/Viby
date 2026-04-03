# viby runner

`runner` 是 `viby` 的后台进程层。
它负责维护机器在线状态、接受 hub 下发的远程创建会话请求，并把 runner
进程内部的会话维护、heartbeat 和本地控制面收口到单一路径。

## 当前定位

- 对用户来说，`runner` 默认由 `viby hub` 自动拉起
- 对实现来说，`runner` 仍然是独立进程，便于看护、升级和回收
- Web 端之所以能远程创建新会话，本质上就是通过 hub 调用 runner

## 生命周期

### 启动

典型路径：

1. `viby hub` 启动
2. hub 调用 `startRunnerProcess()`
3. 新进程进入 `src/runner/run.ts`
4. runner 完成锁文件、状态文件、HTTP 控制端口、WebSocket 注册
5. hub / Web 即可通过 RPC 请求 runner 创建或停止会话

owner 边界：

- `hub/src/runtime/managedRunner.ts` 是 runner 生命周期 owner，统一决定
  `startup / reuse / restart / stop`
- `cli/src/runner/run.ts` 只负责 runner 进程内主循环
- `cli/src/runner/runnerHeartbeat.ts` 是 runner 周期维护 owner，统一处理
  stale session pruning、CLI install drift 提示和本地状态心跳

### 心跳

runner 会周期性做三件事：

- 上报机器在线状态
- 清理已退出的会话进程
- 检查当前 CLI 二进制是否已变化

补充约束：

- stop 请求发出后，会话仍由 runner 持续跟踪，直到子进程真实退出或 heartbeat 判定已死
- 不允许在 kill 请求刚发出时就提前把会话从 runner tracking 删除，避免留下未跟踪的幽灵窗口

### 停止

停止时会：

- 先结束 runner 自己拉起的 hub-managed session 子进程
- 写入 shutting-down 状态
- 关闭 WebSocket 与本地 HTTP 控制服务
- 删除 `runner.state.json`
- 释放锁文件

## 远程创建会话

流程如下：

```text
Web/PWA -> hub RPC -> runner -> spawn viby process -> session 回连 hub
```

runner 在创建会话时会：

- 检查目录是否存在
- 必要时创建目录
- 显式透传 `permission mode`、`collaboration mode`、model 和 reasoning effort 这组 session config
- 注入代理所需环境变量
- 启动新的 `viby` 子进程，并把其生命周期绑定到当前 runner
- 等待新会话回报 `session-started`
- 对 resume 场景，只有真的重新接回旧 agent session 才算成功；Codex resume 失败不会再静默新建 thread 冒充恢复

## 支持的代理

| 代理 | 内部启动目标 |
| --- | --- |
| Claude Code | `claude` |
| Codex | `codex` |

## 本地控制接口

runner 会启动一个只监听 `127.0.0.1` 的 HTTP 控制服务，供本机 CLI / hub 协调使用。

主要接口：

- `POST /session-started`
- `POST /list`
- `POST /spawn-session`
- `POST /stop-session`
- `POST /stop`

## 测试前置

`runner.integration.test.ts` 现在是 **live integration / 显式 opt-in**：

1. 必须设置 `VIBY_RUNNER_INTEGRATION=1`
2. 必须提供 `VIBY_RUNNER_INTEGRATION_API_URL`
3. 必须提供 `VIBY_RUNNER_INTEGRATION_CLI_API_TOKEN`

测试启动时会强制创建临时 `VIBY_HOME`，把 `runner.state.json`、logs 和
settings 全部写进隔离目录，不再允许默认命中真实 `~/.viby`。

这样做的原因很直接：

- `stopRunner()` / `stopRunnerHttp()` 有真实副作用
- integration tests 需要可控的 runner state
- 开发中的 `bun run dev:remote` / 本机在线 machine 不能再被测试误停

## 状态文件

默认写入 `~/.viby/runner.state.json`，包含：

- PID
- 控制端口
- 启动时 CLI 版本
- 最近心跳时间
- runner 日志路径

## 关键实现文件

- `src/runner/run.ts`：runner 主循环
- `src/runner/runnerHeartbeat.ts`：runner 心跳、自维护与本地 state ownership
- `src/runner/controlServer.ts`：本地 HTTP 控制服务
- `src/runner/controlClient.ts`：CLI / hub 侧控制客户端
- `src/runner/doctor.ts`：runner 诊断
- `src/runner/types.ts`：runner 相关类型
