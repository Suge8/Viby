# Hub Owners

`hub/` 是 Viby 的 durable control plane。

## 必守边界

- durable mutation 与 authoritative snapshot 保持单一 owner
- runtime status 的浏览器入口只认 Hub 写入的运行时地址；`0.0.0.0` / `::` 只允许作为 bind host，默认 public URL 必须解析成具体局域网地址并保留 `localHubUrl` 给 AppCore / local API
- `public_access_enabled` 是公网 Hub 直连 + pairing/WebRTC/WSS relay 的唯一 Hub policy；持久化事实源是 `settings.toml`，运行中的 Hub 监听该文件热更新策略，禁止重启进程或并行第二套开关；默认开启，关闭时 Hub 必须拒绝公网 Host/Origin/forwarded client 与新 pairing create，但保留 loopback/LAN/Tailscale 等本地访问
- 产品文案里的“公网入口”只指 `PAIRING_BROKER_URL` / `pairing_broker_url` 生成的 broker pairing 入口；`VIBY_PUBLIC_URL` / `public_url` 只叫高级 Hub 公网直连地址，给自配反代 / TLS / Host 的高级用户使用，二者不得互相替代
- `37173` 只是默认 Hub listen port；运行时 fallback 端口只写 runtime status，不得把随机 fallback 持久化成新的用户期望端口
- route / service / store 不得平行复制第二套 durable write 链
- Web selected session 主快照的 authoritative HTTP owner 继续只认 Hub `/sessions/:id/view`；禁止 route/service/Web 再平行拼装第二份 `session + messages + stream + watermark` 会话视图
- Hub 静态 Web 资源选择只认 `hub/src/web/webAssetDist.ts`；非 compiled dev/server 模式必须先校验 `build-meta.json` 协议窗口，禁止旧 Hub 服务新 `web/dist` 后让用户掉进误导登录页。
- route JSON body 校验策略只认 shared `validateJsonBody()`；Hub Hono 适配只认 `hub/src/web/routes/sessionRouteSupport.ts` 的 `createJsonBodyValidator()` / `parseJsonBody()`，handler 只消费 validated body，禁止 route 私有 `req.json() + safeParse()` 再复制第二套
- archive / restore / history / delete 只认 lifecycle owner
- attachment upload / delete 只认 Hub `uploadFile` / `deleteUploadFile` owner；Hub 必须走 machine-scoped 文件 mutation，不得因为选图/删图先偷偷恢复 session，send / retry 继续是唯一恢复入口。
- attachment upload HTTP transport 只认 multipart `FormData + File` 主路径；Hub route 负责唯一一次文件读取、大小校验与转 RPC payload，禁止继续兼容或恢复 base64 JSON 第二链路。
- passive notice 必须先完成同一条 wake / resume owner，再写 durable notice
- `SyncEngine` 必须继续保持薄 façade / orchestration owner；read API 与 session API 可以分层，但 send / resume / unarchive / attachment mutation 的自动恢复不得绕过 `SyncEngine` 主入口直连底层 service
- session driver / resume token 只认 `metadata.driver + runtimeHandles` 这一条 durable source of truth；legacy `metadata.flavor` 只允许在 store 写入时一次性归一
- `resumeAvailable / resumeStrategy` 的 read-model 语义只认 shared resume owner；Hub summary/read-model 只物化结果，不并行维护第二套判定链
- session activity summary 只认 `sessions.latest_activity_*` 物化列；列表、摘要与通知链路不得重新扫描 `messages` 计算第二套 activity
- message append 必须把 `messages` 插入、session activity 物化与 `updated_at` 推进收敛到同一条事务 owner；禁止先提交消息、再补第二次 session 写
- session cache refresh 必须优先回放 durable `active/activeAt`；不得让旧内存 `active/thinking` 覆盖 store，避免把 stale running 继续广播成事实
- session lifecycle metadata 写入必须 await `SessionCache.setSessionLifecycleState()` / `transitionSessionLifecycle()` 同一条 owner；禁止 fire-and-forget metadata mutation
- `abortSession()` 只允许中断 turn，并把 durable lifecycle 收口到显式 `open`；禁止把“停输出”偷渡成 `close/archive`
- 已进入 history lifecycle (`closed/archived`) 的 session 必须拒绝旧 runtime keepalive 重新激活；只有 Hub-owned `start/resume/driver-switch` 先把 lifecycle 标成 `running` 后，新 runtime 心跳才可重新接管
- history session `resume/start` 成功后，Hub lifecycle owner 必须立刻把 durable `metadata.lifecycleState` 收口到 `running`；禁止留下 `active=true` 但 metadata 仍是 `closed/archived` 的裂脑状态
- spawn RPC ack 不是 session 已可发送的证明；`spawnInactiveSession()` 必须继续等待同一条 authoritative session-state owner 观测到 `active=true`，不得在 machine RPC ack 和 session alive patch 之间同步读一次 `session.active` 就提前失败
- spawn / resume 失败恢复前的 lifecycle 只能记录 shared 语义状态 `getSessionLifecycleState(session)`；禁止直接信任 raw metadata，把旧的 `active=false + lifecycleState=running` 再写回 durable row。
- session runtime detached、inactive 过期、以及 Hub 冷启动历史修复，必须统一把 `active=false + lifecycleState=running` 归一到 `open`；只停进程，不把用户未关闭的会话送进 history
- runtime `stopping` 只允许作为 Hub 内存瞬态投递门控状态；不得持久化进 lifecycle，也不得参与“进行中/历史”分组。send gate 看到 stopping 必须等 runtime 结束或恢复后再投递 / resume
- 已显式标成 `open` 的 session 在 runtime detached / `session end` 后必须继续保留 `open`；history owner 不得把这类“可继续的当前会话”再次归一到 `closed`
- provider runtime handle 只允许由 AppCore `onSessionFound` 事件驱动回写，并且必须等 Hub metadata ack 后才算拿到 durable resume token
- 无 token 历史会话的 continuity fallback 只认 Hub lifecycle owner 构建的 authoritative handoff snapshot；禁止 Web / AppCore 并行补写第二条 durable resume token 链
- app-core-managed `claude / codex / cursor / gemini / opencode / copilot` 若缺 durable handle，只能通过同一条 Hub `resumeSession()` owner 走 transcript continuity handoff 重拉起；不得伪造 provider token
- `pi` 有 durable handle 时同样走 provider-handle resume；无 handle 的旧 Pi 会话只允许由同一条 Hub `resumeSession()` owner 走 transcript replay fallback
- 旧的 app-core-managed Copilot 随机 runtime handle 只允许在 `storeSchemaMigrationSupport` 里一次性清理；`resumeSession()` 主链不得长期保留第二条 legacy 兼容分支
- runtime capability read-model 只认 `hub/src/runtime/runtimeCapabilityCache.ts`：scope = `machineId + directory`，snapshot 同时表达 availability、per-agent launch config、detected/expires、per-agent refreshing/error；route/service 不得绕过它直连 AppCore RPC 做第二份状态
- Hub `/runtime/capabilities` 是 Desktop/Web 统一读取入口；旧 availability / launch-config route 只能作为同一 cache owner 的投影，不得另跑检测或本地推导 provider / 目录配置
- Hub `/runtime/agent-config` 是 Desktop/Web 统一 agent 配置入口；Hub 只校验 shared schema 并转发 AppCore runtime RPC，禁止在 Hub 复制 provider config 路径、默认值或文件写入逻辑
- Hub runtime capability cache 必须 stale-while-revalidate：有旧 snapshot 先返回，missing/expired 后台 refresh；同 machine + directory + driver + depth pending request 必须 dedupe；force refresh 不得复用已在途的 non-force 检测，必须排队穿透底层 runtime cache；per-agent refresh 独立，慢 Pi 不得阻塞其他 provider 更新
- spawn-time 最终真实性只认 Hub -> AppCore runtime owner：`POST /runtime/spawn` 必须通过 runtime capability cache force 校验 selected agent availability；显式 model / reasoning override 需要 launch config 校验；Pi 默认启动也需要 launch config，因为 Pi child 启动前必须读取同一份 RPC model/state；其他默认启动优先避开慢模型探测；错误只暴露 code/产品文案，不返回 raw provider reason 给 UI
- **spawn 单一控制点**：Hub spawn API (`POST /runtime/spawn`) 必须先过 runtime capability 校验，再在返回前调用 `ensureSessionDriver()` 确保 `driver` 和 `model` 已设置；这是唯一能保证新 session metadata 完整性的控制点
- **driver-switch config 单一控制点**：same-session switch 的目标模型兼容性与 permission/reasoning/collaboration sanitize 只认 `sessionSwitchConfig.ts`，并且 spawn-time overrides 与 durable session config 必须复用同一份归一结果；禁止 route/service/cache 再拼第二套清理逻辑
- schema version 判定、迁移、mismatch message 和 required-table/assert 必须共用 `storeSchemaDefinition + storeSchemaSupport + storeSchemaMigrationSupport`，禁止 route/service/store 再复制第二套迁移判断
- message 写入后推进 session activity / updated_at 的语义必须共用单一 store owner；service / socket handler 禁止再各自拼写一份 durable update 逻辑
- `local` / `link` 设备的 `active` 只认 `DevicePresenceTracker`；禁止 route/service 重新引入 `last_seen_at + TTL` 或 socket-disconnect-grace 判 active
- `pairing:` 设备（`channel='scan'`）的在线状态只认 desktop bridge map；Hub 只保存元数据，revoke 只走 `DeviceAuthStore.deletePairingDevice` 硬删路径
- 以后新增设备 channel 需在 `isActiveDevice` 中明确 owner，不得重推 lastSeen TTL

## realtime 与恢复

- connection state recovery 只是短断线优化
- 真正的跨 reconnect / Hub reload 恢复继续只认 snapshot + catch-up
- assistant transient stream 的收口只认 shared canonical `assistantTurnId`
