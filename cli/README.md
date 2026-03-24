# Viby CLI

`Viby CLI` 负责启动 `viby hub`、提供认证/诊断/MCP 能力，并承载 hub 内部使用的 agent 启动实现。
会话创建入口已经收口到 `hub / web / PWA`，不再通过公开 CLI 子命令直接创建会话。

## 能做什么

- 由 hub 在内部拉起 `Claude Code`、`Codex`
- 把会话注册到 hub，供 Web / PWA 远程查看与控制
- 提供 MCP bridge，供外部工具接入
- 提供诊断、认证和 runner 相关能力
- hub 停止时会同时收掉它管理的 runner 会话；不会再保留“hub 退了、会话继续跑”的旧语义
- 会话 `permission mode` / `collaboration mode` 现在会作为 durable session config 写进 hub store；spawn / resume 都走同一条显式参数链，不再依赖内存 keepalive 当唯一事实源
- dev 源码态下，runner 安装戳复用判断不能只看 `package.json`；当前实现会优先跟踪 `cli/src/**` 的最新变更时间，缺失源码时间戳时再回退到 CLI 版本号，避免 hub 热更新后继续复用旧 runner
- Codex remote 会在空闲阶段预热 app-server thread，列表标题默认回退 metadata/path，不再为首轮自动命名额外起桥
- 这类 Codex remote thread 预热只属于内部 runtime 准备，不应推进会话 `thinking`、也不应把内部 warmup 事件写进用户可见 transcript
- Claude / Codex remote 的 live model / reasoning effort 切换都只影响下一轮 turn；当前 in-flight turn 不会被追溯改写
- runner-managed Codex resume 启动期必须同步重新接回旧 thread；不会再先报“恢复成功”再把真正 resume 偷偷延后到首轮 turn
- Codex resume 失败会直接报错，不会再 silent fallback 成一个新的 thread 假装恢复成功
- `ApiSessionClient` 首次连上 hub 时会先用已恢复的 session snapshot 作为 keepalive 种子；后续 reconnect 继续重放最近一次 live keepalive snapshot，不会再先把会话硬回写成 `thinking=false`
- Codex thread binding 只走 `AgentSessionBase.onSessionFound()`；`thread started / resumed / compacted` 统一复用同一条 durable `codexSessionId` 更新链；相同 thread id 的重复上报只去重 metadata 同步，不会吞掉下游 session-found 回调
- Codex remote assistant 正文 delta 现在会走专用 transient stream 通道推到 hub/web；reasoning 继续 final-only，不会把 chunk 级输出写进 durable transcript

## Provider Support Matrix

当前 support matrix 明确分两层：

- **核心 provider**
  - `Claude Code`
  - `Codex`
- **实验 / 内部 provider**
  - `Gemini`
  - `Cursor Agent`
  - `OpenCode`

边界规则：

- Web / PWA 主产品线默认按 `Claude Code + Codex` 设计与验证
- 实验 provider 可以继续保留，但不允许各自再平行复制一套
  session bootstrap、runner lifecycle、permission config 或 remote MCP bridge
- provider 共享边界当前统一走：
  - `src/agent/sessionFactory.ts`
  - `src/agent/runnerLifecycle.ts`
  - `src/agent/providerConfig.ts`
  - `src/agent/acpAgentInterop.ts`

## 常用命令

```bash
viby hub               # 启动 hub
viby hub --relay       # 启动 hub 并连接官方 relay
viby mcp               # 启动 MCP stdio bridge
viby auth login        # 写入 CLI_API_TOKEN
viby auth status       # 查看认证配置
viby doctor            # 诊断当前环境
viby runner status     # 查看 hub 管理的 runner 状态
```

## 会话创建

1. 启动 `viby hub`
2. 打开终端输出的 Web / PWA 地址
3. 在新建会话流程里选择代理、目录和模型

## 关键配置

- `CLI_API_TOKEN`：CLI 与 hub 共享的认证令牌
- `VIBY_API_URL`：hub 地址，默认 `http://localhost:37173`
- `VIBY_HOME`：配置目录，默认 `~/.viby`
- `VIBY_CLAUDE_PATH`：指定 `claude` 可执行文件
- `VIBY_HTTP_MCP_URL`：`viby mcp` 默认连接地址

测试 / 临时调试如果会触发 `runner stop`、写 `runner.state.json` 或改 settings，
应该显式切到独立目录，例如：

```bash
VIBY_HOME="$(mktemp -d /tmp/viby-dev.XXXXXX)" bun test
```

## 本地目录

`Viby` 默认把状态写入 `~/.viby/`：

- `settings.toml`：令牌、机器 ID、基础设置
- `viby.db`：hub 的 SQLite 持久化；当前 schema version 为 `8`
- `runner.state.json`：后台 runner 状态
- `logs/`：日志文件

当前构建会在 hub 启动时自动执行 **`v7 -> v8`** 升级，补齐
`sessions.permission_mode / collaboration_mode`。
更老的 schema 仍需先备份，再重建或离线迁移旧库。

## 开发与构建

```bash
bun install
bun run build:cli
```

如需打包单文件可执行：

```bash
bun run build:single-exe
```

## 版号事实源

- 对外运行时版号以 `cli/package.json` 为单一事实源
- `bun run sync-version <version>` 会同步 `cli / hub / web / shared / desktop` 以及 Tauri / Cargo 版号
- `bun run release-all <version>` 会复用同一套同步逻辑

## 目录说明

- `src/commands/`：命令定义与路由
- `src/claude/`：Claude Code 适配
- `src/codex/`：Codex 适配
- `src/gemini/` / `src/cursor/` / `src/opencode/`：实验 provider 适配
- `src/agent/`：provider 共享边界；session bootstrap、runner lifecycle、config 解析、ACP interop
- `src/runner/`：后台 runner 与 hub 内部会话拉起
- `src/modules/`：ripgrep、diff、git 等能力
- `src/ui/`：终端输出与诊断界面
