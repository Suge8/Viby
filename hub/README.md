# Viby Hub

`Viby Hub` 是整个系统的控制面。
它负责 HTTP API、Socket.IO、SQLite 持久化、Web 资源托管，以及后台 runner 的自动拉起。

## 主要职责

- 接收 CLI 上报的会话、消息、状态与权限请求
- 为 Web / PWA 提供 REST API 与 Socket.IO 实时流
- 保存会话、消息、机器与推送订阅
- 提供文件、Git、终端、远程创建会话等能力
- 启动时自动拉起后台 runner，保证远程发起新会话可用
- hub 是自己管理的 runner / session 生命周期 owner；停止 hub 时会一起结束这些会话
- supervised runner 首次启动失败或后续异常退出时会按指数退避自动重试；hub 不再因为 runner 短断线直接退出
- hub watch 重启时，如果旧 runner 仍在运行且安装戳一致，新的探测进程会直接复用旧 runner 并 `exit(0)`；这属于正常接管，不应再被视为启动失败
- 托管 Web 静态资源时，`/`、`/sw.js`、`/manifest.webmanifest` 与 `.html` 统一走 `no-cache`，只有 `/assets/*` 继续走 immutable 长缓存，避免开发态和 PWA 被旧壳接管

## Runtime 架构

- `src/index.ts` 现在只保留进程级入口：信号处理、fatal error 收敛、启动/退出调度
- `src/runtime/processController.ts` 是稳定进程壳：配置加载、`Bun.serve`、Socket.IO 宿主、runner/tunnel 监管、runtime status 写入
- `src/runtime/core.ts` 是可销毁业务 runtime：`SyncEngine + NotificationHub`
- `src/runtime/accessor.ts` 负责 runtime 原子替换；dev hot reload 和正式启动都复用同一条边界
- `src/runtime/runtimeHost.ts` 是 runtime 生命周期 owner：`start / reload / shutdown` 统一从这里过；`src/runtime/managedRunner.ts` 负责 runner lifecycle 单一 owner，当前统一以单一 active binding 管理 `child runner / reused runner`，不要再在别处并行长第二套 runner/reload 状态机
- `src/web/server.ts` 把 HTTP `fetch` handler 提炼成可重建函数，这样 `bun --hot` 下可以只换 handler，不用重建整个 socket 宿主
- `src/sync/syncEngine.ts` 继续作为 sync façade；session lifecycle / resume contract 已收口到 `src/sync/sessionLifecycleService.ts`，消息、机器、RPC 仍各自走单职责 owner
- `src/sync/teamCoordinatorService.ts` 是 team durable mutation 与 manager project bootstrap owner；manager session 的 durable project 必须在 `/cli/sessions` 返回前完成创建/复用
- `src/sync/teamMemberSessionService.ts` 是 inactive member `resume vs revision` 与 compact carryover brief contract owner；不要再让 Web / CLI / prompt 各写一套判定。当前一期只比较**同角色 inactive candidate**；在没有 `member seat / task lineage` 身份前，不跨角色硬猜 revision lineage
- `src/sync/teamOrchestrationService.ts` 是 manager recruit / replace / task orchestration / direct member messaging / project delivery owner；`team_members`、`team_tasks`、`team_events` 的真实编排行为只从这里进，再委托 `TeamCoordinatorService` 落 durable mutation
- `src/sync/teamOrchestrationContext.ts` 只负责 team orchestration read/validation；新 task record / event record builder 只认 `src/sync/teamOrchestrationRecords.ts`，project snapshot assembly 只认 `src/sync/teamOrchestrationProjectSnapshot.ts`，不要再把写侧 builder 混回 context reader
- `src/sync/teamOrchestrationRoleFlow.ts` 是 project-scoped custom role catalog owner；`src/sync/teamPresetFlow.ts` 是 versioned bootstrap preset import/export owner。两者都只允许围绕 durable role catalog 与 project settings 工作，不回退到第二套 Web/CLI mutable schema
- `src/sync/teamAcceptanceService.ts` 是 review / verification / manager final acceptance 的 orchestration owner；最终状态继续只落在 `team_tasks + team_events`
- `src/sync/teamLifecycleService.ts` 是 manager teams archive / restore / history owner；`/api/sessions/:id/archive|unarchive` 进入后，必须在这里把 manager session 映射成 `project archive/reopen`、member session 映射成 `member archive/restore`，且 `removed / superseded` member 不得被通用 restore 偷偷拉回
- `shared/src/teamAcceptance.ts` 是 review / verification / manager acceptance / delivery-ready 派生读模型 owner；`src/sync/teamCoordinatorService.ts` 会把它物化成 authoritative `snapshot.acceptance`，Web `ProjectPanel` 与 CLI tool result 都应只消费这条读模型，不再各写一套 acceptance state，也不再从截断 `snapshot.events` 逆推
- generic `team_create_task / team_update_task` 不能直接把 task 写成 `done`；`done` 只允许由 `teamAcceptanceService.acceptTask()` 写入。`src/sync/teamOrchestrationContext.ts` 的 close gate 也只认 `shared/src/teamAcceptance.ts` 派生的 authoritative delivery-ready 结果，不能只看“还有没有 open tasks”
- session resume / switch 的 waiter 现在统一收口到 `src/sync/sessionCache.ts` 共享实现；不要再在 lifecycle/service 层各自手写 `subscribe + timeout + cleanup`
- `src/web/routes/sessions.ts` 现在只保留 sessions 路由装配；session action / config 细分到 `src/web/routes/sessionActionRoutes.ts`、`src/web/routes/sessionConfigRoutes.ts`，共享 guard / body 解析收口到 `src/web/routes/sessionRouteSupport.ts`
- `src/web/routes/teams.ts` 现在只保留 manager-teams route entry；project/member/task 级注册拆到 `src/web/routes/teamRouteRegistrars.ts`，共享 schema/support 继续收口在 `teamRouteSchemas.ts` / `teamRouteSupport.ts`
- `src/store/messages.ts` 的消息序号现在由 `sessions.next_message_seq` 单点分配；不再在消息热路径里做 `MAX(seq)+1`
- `src/store/teams.ts` 继续是 team durable CRUD 的单一 public owner；project/role SQL 支撑已拆到 `src/store/teamProjectRoleStore.ts`，row mapper 与 `Session.teamContext` join/query 细节拆到 `src/store/teamRecordMappers.ts` / `src/store/teamSessionContext.ts`，但不允许把第二套 team store owner 再扩回 service 或 route 层

## 关键配置

- `CLI_API_TOKEN`：CLI 与 Web 登录共享的令牌
- `VIBY_LISTEN_HOST`：监听地址，默认 `127.0.0.1`；需要手机经局域网或 Tailscale 直连时设成 `0.0.0.0`
- `VIBY_LISTEN_PORT`：监听端口，默认 `37173`
- `VIBY_PUBLIC_URL`：可选的对外访问地址；用于单独前端、二维码/复制入口或反向代理场景，同源直连当前 hub 时不需要额外配置
- `CORS_ORIGINS`：允许的跨域来源
- `VIBY_HOME`：数据目录，默认 `~/.viby`
- `DB_PATH`：SQLite 文件路径，默认 `~/.viby/viby.db`
- `VIBY_RELAY_API`：relay API 域名
- `VIBY_RELAY_AUTH`：relay 鉴权键
- `VIBY_RELAY_FORCE_TCP`：强制 relay 走 TCP
- `VAPID_SUBJECT`：Web Push 联系信息

## 启动方式

```bash
viby hub
```

推荐公网访问：

```bash
viby hub --relay
```

局域网 / Tailscale 直连示例：

```bash
VIBY_LISTEN_HOST=0.0.0.0 viby hub
```

随后从另一台设备直接打开：

```bash
http://<这台电脑的局域网或 Tailscale 地址>:37173
```

只要页面就是从这个地址加载出来的，Hub 会按同源握手放行 Socket.IO，realtime
无需再单独配置一份 WebSocket 地址。

如果 `public_url = ""` 或 `cors_origins = []`，Hub 会回退到本机地址推导，
自动把 `127.0.0.1`、`localhost`、`[::1]` 这些 loopback 别名一起纳入允许来源，
避免桌面壳和浏览器在本机别名之间切换时出现 `socket.io 403`。

对 `5173 -> 37173` 这种远程开发跨源链路，CORS 不只要放行 origin，也必须让
`allowMethods` 和真实公开 API method 保持一致。当前 Web 会用到的跨源 method
至少包括 `GET / POST / PATCH / DELETE / OPTIONS`；如果少了 `PATCH`，就会出现
会话重命名在 `37173` 同源静态页正常、在 `5173` dev 页被浏览器 preflight 拦掉的分叉。

从源码运行：

```bash
bun install
bun run dev:hub
```

如果你通过根目录的 `VIBY_REMOTE_HUB_WATCH=1 bun run dev:remote` 联动调试 hub：

- hub 重启窗口里偶发 1 到 2 条 `ws proxy ECONNRESET` 属于正常现象
- 当前 watch 入口已经改成 `bun --hot run src/devHot.ts`；正常源码变更会原地替换 runtime，而不是默认杀掉整个 hub 进程
- 新 hub 可能会先拉起一个 runner 探测进程；若旧 runner 仍在运行，它会打印 `Runner already running with matching version` 后正常退出
- 这种 `exit(0)` 会被视为“成功复用旧 runner”，不是启动失败
- hub 在复用成功后仍会继续监听同一台 machine 的 `runnerState` / online 状态；如果旧 runner 后续掉线、进入非 `running`，或 PID 已死但 machine 还没来得及超时下线，hub 都会自动重新接管
- 只有持续刷 runner 指数退避重试，才算异常
- 如果日志里出现 `VapidPkHashMismatch`，那是旧 Web Push 订阅仍绑定旧 VAPID 公钥；它不会造成 realtime 断链，当前实现会清理这类陈旧订阅并等待浏览器重新订阅

## API 概览

- `POST /api/auth`：基于 `CLI_API_TOKEN` 登录
- `GET /api/sessions`：会话列表；返回 lifecycle 与最近消息活动摘要，供 Web 正确区分 `处理中 / 待输入 / 已关闭 / 已归档` 和 `新回复未看`
- `POST /api/sessions/:id/archive` / `close` / `unarchive`：返回最终 `session` 快照；用于 Web 立刻把 lifecycle 写回缓存，避免先掉进 `已关闭` 再等待下一拍 metadata 修正
- `PATCH /api/sessions/:id`：重命名会话；远程 dev 跨源调用依赖 Hub CORS 允许 `PATCH`
- `POST /api/sessions/:id/resume`：同步 resume 契约；只有旧 agent session 真正重新接回后才返回成功，失败则直接返回错误并完成 cleanup，Web 不承担补偿重试
- `GET /api/sessions/:id` / `GET /api/sessions/:id/messages`：detail 读模型入口；打开详情页本身只能走只读查询，不得顺手触发 `POST /api/sessions/:id/resume`
- detail 打开后的恢复 owner 继续只认显式用户意图：真正允许进入 `resume/start` 的路径只有显式发送、显式上传附件，或 Web 已明确记录的首次非空输入意图 warmup；Hub 不为 mount、`autoFocus`、单纯 focus 或只读浏览补开第二条隐式恢复分叉
- `POST /api/sessions/:id/permission-mode` / `collaboration-mode` / `model` / `model-reasoning-effort`：统一返回最终 `session` 快照；如果 apply 成功后拿不到 snapshot，Hub 会直接报错，不把空快照漏给 Web
- CLI `update-metadata` 不能修改 lifecycle 元数据；`lifecycleState / lifecycleStateSince / archivedBy / archiveReason` 只允许 Hub lifecycle owner 改写，避免 archived 被任何后续 metadata 同步误擦成 closed
- `GET /api/sessions/:id/messages`：消息分页
- `GET /api/sessions/:id/messages?afterSeq=<seq>`：按 SQLite seq 做 reconnect catch-up；用于 Web/CLI 在 unrecovered reconnect 后补齐缺失消息
- `POST /api/sessions/:id/messages`：发送消息；generic user send 只允许普通 session 或 `controlOwner='user'` 的 member，manager-controlled member transcript 必须继续走 team-owned internal append path
- `POST /api/sessions/:id/permission-mode`：切换权限模式
- `POST /api/sessions/:id/model`：切换 remote Claude / Codex 会话模型；从下一轮 turn 生效
- `POST /api/sessions/:id/model-reasoning-effort`：切换 remote Claude / Codex 会话思考强度；从下一轮 turn 生效；Hub 会按 flavor 校验可用档位
- `GET /api/machines`：在线机器列表
- `POST /api/machines/:id/spawn`：远程创建会话；支持 `sessionRole: normal | manager`，成功时直接返回最终 `session` 快照；manager role 会在 `/cli/sessions` 返回前先完成 durable project bootstrap，再把已带 `teamContext` 的 authoritative snapshot 回给 Web
- `GET /api/team-projects/:projectId` / `history`：manager/member detail surface 读取 team snapshot 与结构化 timeline 的单一入口；project snapshot 会同时返回 authoritative `acceptance` 读模型与 `compactBrief`，后者是 manager autonomy 的唯一 compact orchestration contract，且 `compactBrief.staffing` 会带出 authoritative seat-budget / staffing hints
- team snapshot 自带的 role catalog 也是 manager/member detail surface 的单一 role label 事实源；Web 只有在拿到 project snapshot 时才允许用 role catalog 生成 `Name (prototype)` 这类 custom role label，列表/成员 chat 顶部仍只消费 `SessionSummary.team`
- `POST /api/team-projects/:projectId/roles` / `PATCH /api/team-projects/:projectId/roles/:roleId` / `DELETE /api/team-projects/:projectId/roles/:roleId`：project-scoped custom role catalog CRUD；built-in prototype 保持只读，custom role prompt overlay/default config 只从这条 durable owner 进入
- `GET /api/team-projects/:projectId/preset` / `PUT /api/team-projects/:projectId/preset`：versioned bootstrap preset import/export；preset 只覆盖 `projectSettings + custom roles`，且 import 只允许无 durable members、无 durable tasks 的 bootstrap 状态
- `POST /api/team-members` / `PATCH /api/team-members/:memberId` / `POST /api/team-members/:memberId/message`：manager teams 编排入口；分别对应 recruit-or-resume、remove-or-replace、经理直达成员 transcript 的 authoritative command
- `POST /api/team-tasks` / `PATCH /api/team-tasks/:taskId`：manager teams durable task orchestration；task metadata patch 会落 `task-updated` event，而不是伪装成 comment/status change
- `POST /api/sessions/:id/archive` / `unarchive`：仍是统一 lifecycle API；但进入 Hub 后会走 `teamLifecycleService` 做 team-aware 映射，保证 manager project reopen 不会顺手复活 archived members
- `POST /api/team-tasks/:taskId/review-request` / `review-result` / `verification-request` / `verification-result` / `accept`：manager teams acceptance chain；都只经 Hub owner 落库，再由 Web/CLI 读取 authoritative `snapshot.acceptance`
- manager passive notice 继续只走 `SyncEngine.appendPassiveInternalUserMessage()`：同一条 owner 会先完成 manager session 的 authoritative wake/resume，再把 durable notice 写进 transcript；若 wake/resume 失败，控制/acceptance 动作会在 durable mutation 前 fail-fast，不再保留“只写 notice 假成功”的分叉
- `POST /api/team-projects/:projectId/close`：manager final project delivery；会先检查 authoritative delivery-ready gate，再归档所有 active members，最后把 project status 切到 `delivered`
- `GET /api/push/vapid-public-key`：Push 公钥

更详细的路由请看 `src/web/routes/`。

`/api/auth` 使用的是 `CLI_API_TOKEN`，不是网站账号密码。
如果远程 dev 页持续报 `401`，除了核对 token 本身，也要检查浏览器是否把某个旧密码/
Autofill 凭据错误地塞进了这个字段。

## 实时通道

Web 主链路当前统一为 `Socket.IO`：

- 首屏数据仍走 REST
- 增量同步走 `/web` namespace
- transport 采用 `polling -> websocket` 升级路径，优先保活，再争取更低时延
- server 侧开启 connection state recovery，短暂断线优先走恢复而不是整页重拉
- 连接恢复只负责补 realtime 状态，不会隐式恢复业务消息或自动发送 `continue`
- 真正的跨重启恢复主路径是 `session snapshot + afterSeq catch-up`；即使 server restart 让内存 recovery 失效，也仍以 SQLite seq/version 为真相源补齐状态
- `session-alive` 会把 `sessions.active / active_at` 节流写回 SQLite，Hub 重启后的短窗口不再因为内存清空就把会话立刻判成 inactive；真正失活仍只由 Hub 的 inactivity timeout 单点过期
- Codex remote assistant 正文流式现在走独立 transient path：CLI 用 `stream-update` 上报 delta，Hub 只在内存里维护当前 session stream 并向 Web 广播 `session-stream-updated / cleared`；最终完整消息仍按原来的 durable message path 落库
- Web 侧不再保留 `/api/events`、`/api/visibility` 这类旁路实时入口

### CLI -> Hub

- `message`
- `update-metadata`
- `update-state`
- `session-alive`
- `session-end`
- `stream-update`
- `machine-alive`
- `rpc-register`
- `rpc-unregister`

### Web -> Hub

- `terminal:create`
- `terminal:write`
- `terminal:resize`
- `terminal:close`

### Hub -> Client

- `update`
- `rpc-request`

## 数据存储

Hub 使用 SQLite 作为单一事实源，保存：

- 会话与元数据
- 消息与分页游标
- 机器与 runner 状态
- `team_projects / team_members / team_tasks / team_events`
- push 订阅
- 待办与协作信息

当前 schema version 为 `11`。
启动时会自动执行 **`v7 -> v11`**、**`v8 -> v11`**、**`v9 -> v11`** 和 **`v10 -> v11`** 升级：

- 补齐 `permission_mode / collaboration_mode / next_message_seq`
- 新增 `team_projects / team_members / team_tasks / team_events / team_roles`
- 为 `team_members` 回填 `role_id`，并补齐 built-in role catalog durable seed
- `Session.teamContext / SessionSummary.team`、custom role catalog 与 bootstrap preset 都由 v11 durable data 驱动

更老的 schema 版本不在自动迁移范围内；升级前依旧建议先备份 `~/.viby/viby.db`。

## 目录结构

- `src/web/`：HTTP 服务与路由
- `src/web/routes/sessionActionRoutes.ts`：resume / lifecycle / upload / slash commands / skills 这类 session action 路由
- `src/web/routes/sessionConfigRoutes.ts`：permission / collaboration / model / reasoning effort 这类 live config 路由
- `src/web/routes/sessionRouteSupport.ts`：sessions 路由共享 guard、body 解析与错误映射
- `src/socket/`：Socket.IO 入口与 handler
- `src/sync/`：会话同步 façade、消息服务、RPC 网关
- `src/sync/sessionLifecycleService.ts`：session close/archive/unarchive 与 resume contract 的单一 owner
- `src/sync/teamCoordinatorService.ts`：team durable mutation 与 manager project bootstrap owner；不再承担 legacy `teamState` projection 写链
- `src/sync/teamOrchestrationContext.ts` / `teamOrchestrationRecords.ts` / `teamOrchestrationProjectSnapshot.ts`：分别负责 read+validation、durable record builder、authoritative project snapshot assembly，避免 orchestration context 再混入写侧拼装
- `src/sync/teamMemberSessionService.ts`：inactive member `resume / revision` 策略与 carryover brief owner
- `src/store/`：SQLite 持久化；schema / `user_version` 是 durable truth source，持久化字段变更必须和显式 migration 同轮提交。当前自动升级边界是 `v7 -> v11` / `v8 -> v11` / `v9 -> v11` / `v10 -> v11`
- `src/runner/`：hub 自动拉起的 runner
- `src/notifications/`：推送通知
