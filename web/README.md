# Viby Web

`web/` 是 `Viby` 的 React PWA。
它负责远程查看会话、发消息、审批权限、浏览文件、打开终端，以及在连接的机器上创建新会话。

最后检查：`2026-03-27`

下面这份 README 分两层：

- 前半部分讲页面、能力和开发入口，给日常开发者快速定位
- 后半部分保留当前实现的关键行为约束，避免文档和真实运行链再漂移

## 主要页面

- `/sessions`：会话列表
- `/sessions/$sessionId`：聊天页
- `/sessions/$sessionId/files`：文件与 Git 视图
- `/sessions/$sessionId/file`：单文件查看
- `/sessions/$sessionId/terminal`：远程终端
- `/sessions/new`：新建会话
- `/settings`：语言、外观、字号与关于页

## 主要能力

- TanStack Query + Socket.IO 的实时会话同步
- 会话列表收口为移动优先的 `会话 / 归档` 双入口；主列表默认只展示 `运行中 / 最近关闭 / 更早`
- 会话列表 header 继续保留原来的品牌居中构图；真正的列表控制面统一下沉到 header 下方的 sticky toolbar，本体不再额外包一层外卡片，也不保留底部分割线；当前移动端位置已上提到接近贴住品牌 header，避免把品牌、筛选和创建动作重新揉成一层
- 移动端 `新建会话` 在 sticky toolbar 里默认是 `44x44` icon button，`sm` 及以上再展开文字；`会话 / 归档` 的计数与 section 计数统一贴着标题展示，不再做左右分离的双列数字
- 会话 lifecycle 语义统一为 `running / closed / archived`：`停止运行` 保留在主列表可继续，`归档` 会移出主列表，恢复归档后不会自动重启
- 会话列表的 `sessions / archived` tab 继续只认列表 owner；当前详情页中的会话被归档后会回到 `/sessions`，不会再让 `selectedSession.lifecycleState` 被动把列表切去归档 tab
- `archived` 对 realtime 也必须保持粘性：只有显式 `unarchive` 或 authoritative/full session snapshot 能把它拉回；late keepalive 和只带 `active:true` 的 partial patch 一律忽略，避免归档会话被错误打回绿色 `待输入`
- 会话列表状态读模型统一为：生命周期看 `running / closed / archived`，运行中细分看 `thinking + latestActivityKind`，`新回复未看` 只看 `latestCompletedReplyAt`；`updatedAt` 表示稳定列表时间，只用于排序和相对时间，不再拿来猜未读或 `待输入`
- realtime session patch 除了 `active/thinking`，也必须消费 lifecycle metadata；`archive` 的最终归属只信 `lifecycleState='archived'`，不能靠 Web 本地把 inactive 猜成 `closed`
- `abort / switch / archive / close / unarchive` 这类会改变 session runtime 或 lifecycle 的 action 统一要求 Hub 直接返回最终 `session` 快照；`useSessionActions.ts` 会直接把快照写回 `session detail + sessions list` cache，`abort` 还会先 optimistic 拉低 `thinking`，不再依赖 `invalidate + refetch` 补偿，避免 UI 先短暂落进错误分区或卡在 `Stopping`
- `spawn` 也走同一条单次提交链：`POST /api/machines/:id/spawn` 支持 `sessionRole: normal | manager`；成功后直接返回最终 `session` snapshot，`useSpawnSession.ts` 立刻写回 detail + list cache，不再先回 `sessionId` 再等页面二次拉取。manager role 的返回快照已经包含 `/cli/sessions` bootstrap 后的 authoritative `teamContext`
- `/sessions/new` 现在显式提供 `普通会话 / 经理会话`；`sessionRole` 和 agent / model / reasoning / permission / collaboration 一样只走单一 typed create chain，不在页面本地另造第二套 owner
- live config 同样只认 authoritative snapshot：permission / collaboration / model / reasoning effort 成功后统一直写缓存，不再保留 `onRefresh` 或 mutation 成功后的额外 invalidation
- `web/src/api/client.ts` 是 session snapshot 响应归一化的单一边界：如果运行中的 Hub 仍返回旧形状 `sessionId` / `ok:true`，只能在这里补 authoritative `getSession()`；hooks 和 UI 一律只消费最终 `Session`，不要把 mixed response shape 继续往上游扩散
- `delete` 的 client-state 清理统一走 `removeSessionClientState()`：只保留一条 owner 链负责移除 detail query、summary cache 和 message window
- 会话列表与终端快捷键的长按语义统一收口到 `web/src/hooks/useLongPress.ts`：桌面右键、鼠标/触屏长按、移动端 touch hold 都只走同一套 pointer 事件链，不再并行维护 `mouse + touch` 两套状态
- 会话列表卡片当前仍只保留长按 / 右键 action owner；列表正文维持 `标题 + 项目/时间 + 状态胶囊` 的高密度读模型，不再在卡片上常驻第二个 visible action button
- 会话列表 action owner 与菜单开关必须分离：`SessionListActionController` 负责对话框状态，`SessionActionMenu` 只负责菜单显隐；关闭菜单不能顺手卸载 rename/archive/close/unarchive 对话框 owner
- 会话列表 action surface 现在进一步收口成 `menu | rename | confirm` 单一 union state；`SessionList` 只持有 `sessionId + anchorPoint`，不再并行维护 `menuOpen` 或靠 effect 猜测 controller 何时卸载
- `FloatingActionMenu` 只负责 menu surface 本身：点击 item 只执行 `item.onSelect`，不再隐式先 `onClose`；需要关闭当前 surface 的 owner 必须在上层 action 明确表达
- 会话列表 action controller 继续保持同一个 owner，但不再常驻塞进首页 bundle；只有用户真正打开菜单时才按需加载 `SessionListActionController` 与相关对话框逻辑
- agent 流式 `reply` 期间只更新 `latestActivityAt/latestActivityKind`，不会持续推进 `updatedAt`；列表只会在最终 `ready` 或其他真实会话级更新后重排一次，并通过 layout animation 做平滑位移，不再出现边流式边不断换位的抖动感
- 列表黄变绿与 ready toast 必须继续共享同一条 turn-final owner：runner 只有在 pending `agentState` 写入排空后才允许发 `ready`，Web 不为此再维护第二套本地 ready/green 状态机
- 自动 title/summary/sessionId/capabilities 这类 metadata 写入也不会推进 `updatedAt`；它们属于元数据补全，不应被当成列表稳定排序时间
- 会话列表与会话内 header 继续共用同一套 `sessionAgentPresentation` 品牌映射，但状态 owner 已按层级拆开：列表卡片继续保留 `sessionStatePresentation` 胶囊用于高密度扫读，聊天详情页 header 只负责标题/品牌/菜单；运行中 replying 现在固定留在 composer 上方的 `AssistantReplyingIndicator`，并会持续到 final 前、结束后再做轻量淡出；`closed` 的“发送消息以恢复”提示留在 composer placeholder，`archived` 与 message-window warning 则收口到 composer 上方的本地 inline notices，不再把 session-local 提示挂进右上角 floating notice rail
- 用户可见错误文案的单一 owner 是 `web/src/lib/userFacingError.ts`：普通 UI surface 只能传业务 key 或已知用户文案，不要再把底层 `grpc / rpc / transport / stdout / stderr / HTTP` 细节直接透传到 toast、banner、空态或表单错误里
- message window warning 现在只允许在 store / reducer 层传递稳定 key；`web/src/lib/messageWindowWarnings.ts` 定义 warning contract，展示层只在 `useSessionChatLocalNotices.ts` 翻译，不允许再把英文句子当状态值在 store、route 或组件之间传来传去
- 会话列表的“新回复未看”本地持久化继续只认 `latestCompletedReplyAt`，但浏览器存储访问边界统一收口到 `web/src/lib/browserStorage.ts`；`useSessionAttention.ts` 不再直接散写 `window.localStorage`
- 会话/机器这类实时数据默认走“REST 首屏拉取 + Socket.IO 推送修正 + 显式 invalidation”单一路径，避免反复自动 refetch
- 聊天页在发送成功后会做一次有界 HTTP catch-up；就算当前页那次没吃到 realtime 事件，也会主动对齐最新消息和会话状态
- Codex remote assistant 正文 streaming 统一收口到 `message-window-store -> realtimeEventController -> SessionChatWorkspace`：Hub 只广播 transient stream snapshot，Web 只在聊天线程尾部追加 synthetic assistant block；reasoning 继续 final-only，durable transcript 与 `afterSeq` recovery 语义保持不变
- assistant 流式输出期间，`useThreadViewport.ts` 只会在 viewport 仍然 pinned-to-bottom 时继续跟底；一旦用户手动离开底部，就必须立即释放自动滚动控制权，不能再让 transient chunk 抢滚动
- 手机切后台再回来时，页面会优先尝试直接恢复现有 socket，并在 `pageshow / online / visibilitychange` 时主动抢连，而不是只被动等待内部重试
- Hub/Web 的 Socket.IO recovery window 已统一拉长到 10 分钟；在这段时间内，只要页面还能拿到原 session，就优先走无感恢复而不是整页重建
- unrecovered reconnect 现在统一收口到 `runRealtimeRecovery()`：先 invalidates sessions/machines/session snapshot，再按当前消息窗口是否已有 `newestSeq` 决定走 `afterSeq catch-up` 还是最新页加载；selected session snapshot 也只在这条链里更新，不要再并行补第二套 reconnect backfill
- `Socket.IO connectionStateRecovery` 现在只是“短暂断线优化层”；真正的跨重启数据恢复仍然依赖 Hub 的 SQLite seq/version，而不是依赖内存态继续存活
- session detail 与 message window 现在都补上了 `warm snapshot`：页面被手机系统回收或 PWA 被杀后，只要 TTL 内还能命中本地快照，就先复用上次已显示过的会话壳体与消息窗口，再后台补 `getSession/getMessages` 对齐；warm path 默认不再回退到 centered blocking loader
- 页面若被手机系统回收或必须为旧 runtime assets 做恢复，会先记录统一 recovery reason；Web 启动后会用同一条浮层 notice / 过渡语义把“恢复连接 / 恢复页面 / 同步状态”串起来
- `appRecovery.ts` 里的 pending recovery snapshot 只保留短时有效窗口；如果 `build-assets-reset` / `vite-preload-error` 之类恢复原因没在当前这次启动里及时消费，就会被直接丢弃，避免旧的“页面资源刚更新”在后续页面 mount 时重新挂到顶部
- 启动过渡壳会按浏览器语言和本地语言偏好切换文案；`Preparing your workspace` / `Restoring your session` 不再写死英文，也不会和应用内恢复 notice 走两套风格
- loading taxonomy 现在分成三层：route/app 级阻塞加载用轻量 icon hero，chat/files/file 这类结构已知内容继续走共享 shimmer/skeleton primitives，而 chat replying 统一走 composer 邻域的轻量 inline indicator；该 indicator 的气泡本体继续由 `AssistantReplyingIndicator` 自身持有视觉约束，presence 则由专用 hook 做单一路径管理，不依赖线程消息流或第二套 detached status owner；后台 realtime 波动只保留单一轻量 runtime busy notice，短 reconnect/catch-up 默认先经 debounce 再决定是否可见，不再把 reconnecting/syncing/recovery 混成第二套 loading 状态机
- recovery / reconnecting / syncing 进行中会临时抑制底部 PWA install banner，避免“顶部恢复提示 + 底部安装条”同时闪入闪出
- 会话输入草稿与聊天滚动位置会按 session 保存在浏览器本地存储里；草稿生命周期 owner 固定在 `SessionChatWorkspace -> ComposerDraftController -> useComposerDraftPersistence` 这条链，只会在当前 chat route activation 初始化时恢复一次，不会在发送后、手动清空后，或 `/sessions -> /sessions/$id` 回跳首帧里把旧内容误删或误回灌；草稿默认保留 24 小时，超过 TTL 的旧草稿会被自动淘汰，避免无限期残留
- 浏览器本地/会话存储访问边界统一收口到 `web/src/lib/browserStorage.ts`；这里只负责安全访问 storage host、JSON 读写与坏值清理，具体 TTL 和业务 schema 仍留在各自模块
- composer 自动补全现在也改成 interaction-driven：`useSessionAutocompleteQuery.ts` 作为 slash commands / skills 的共享 lazy query owner，`useSlashCommands.ts` 和 `useSkills.ts` 不再在聊天页首开时 eager 拉取候选数据，而是在用户第一次输入 `/` 或 `$` 时再后台预取，并由同一条输入控制链自动刷新候选列表
- 线程滚动位置会在滚动、`pagehide` 和页面转 hidden 时及时持久化；手机切后台后回来，若用户之前不在底部，会尽量按原位置恢复而不是强行吸到底
- 全局运行态提示与聊天外临时提示统一收口到右上角 floating notice stack，并以 MagicUI 的 `AnimatedList` 作为通知栈基底；真正属于消息历史的 `system message` 继续保留在聊天流里，而聊天详情页里只影响当前会话输入/恢复的 local notices 必须留在 composer 邻域，不要再混进 app-level floating rail
- 右上角 floating notice rail 的 app-level owner 继续只认 `AppFloatingNoticeLayer -> notice-center`；persistent notice 同步必须按 notice 集合单次收口，并对语义未变化的 notice 做 no-op upsert，避免 offline/runtime/update/recovery 文案未变时反复触发栈重排；当前这条链已通过真实离线/恢复 profiling 证明稳定，不要再在 viewport 或业务层追加第二套 dedupe，除非有新的实测证据
- 移动端 app-level floating notice 继续保留全局 owner，但 surface 已收口成更窄的 top rail；不要再回退成接近整宽的顶栏卡片，否则恢复/离线提示会像“页面被卡住”一样压住整个手机顶部
- `offline / update-ready` 这类故意持久的 app-level notice 现在默认走 compact rail：只保留标题，不再挂第二行长描述；如果当前 rail 里全是 compact notice，顶部宽度也会再缩一档，避免离线/更新提醒长期占住整块顶部
- notice 的语义标题 / tone 预设统一收口到 `web/src/lib/noticePresets.ts`；页面和表单不要再各自散写一套错误标题
- 实时状态提示已进一步压成单一 `runtime busy` notice：reconnect 与 catch-up 共用同一套轻量 surface，短暂波动默认不露出，避免同一件事连续换两套状态文案
- `useRealtimeFeedback.ts` 里的 `restoring -> busy/hidden` 退出链也已经收口：恢复提示在 reconnect / connect_error / catch-up 期间不能再丢失隐藏定时器；若恢复窗口结束时后台工作还没完成，就自然过渡到 `busy`，而不是把“已回到刚才的会话”长期卡在顶部
- 消息发送、重试与滚动窗口管理
- 聊天消息复制统一收口到 `MessageSurface -> useCopyToClipboard -> safeCopyToClipboard`：消息本体只保留点击复制与 copied 成功态色彩反馈，不再伪装成 `button`、不再叠加按压缩放或 hover chrome；clipboard fallback 的临时 textarea 会通过 `data-viby-transient-editable` 与 `focus({ preventScroll: true })` 路径隔离，避免长消息点击复制时把 chat viewport 带偏
- Codex 会话默认直接复用现有 metadata/path 标题回退，不再为首轮 AI 命名额外起桥
- inactive session 的显式发送与附件上传现在分成两条 owner：文本发送统一走 `hub/src/web/routes/messages.ts -> SyncEngine.sendMessage()` 的单一 Hub command，`inactive + empty transcript` 会在同一个 hub session 上 fresh-start，已有 transcript 的 inactive session 则继续 strict `unarchive -> resume -> send`；附件上传仍由 `useSessionTargetResolver` 做显式恢复准备。两条链都只会在用户显式发送/上传时触发，页面重连不会偷偷续跑
- inactive session 的 composer 现在会在 `focus + 首次非空输入意图` 时做后台 warmup，把 `resume/start` 冷路径前移；这条 warmup 默认是 silent 的，不会因为用户只是点进输入框就先弹恢复失败 toast。真正的恢复失败提示仍只保留在显式发送/附件上传这条 owner 链上
- 聊天页对显式恢复只保留 route-local 的轻量 `isResumingSession` 状态；composer 在恢复期间只做 placeholder / disabled / `aria-busy` 表达，不扩散成第二套全局状态机
- 失败消息重试现在和首次发送共用同一条 send owner：会重新建立 `pendingReply`、补齐 `message_send_start` trace，并复用原始附件元数据，不再出现“首次发送有 sending/preparing，重试没有”的状态漂移
- `resume` 仍保持单次显式操作，但后端完成条件已收口为“旧 agent session 真正重新接回”；Web 不承担补偿重试，也不再需要靠“等一会再点一次”撞过启动竞态
- `/sessions/$sessionId` 继续只信路由参数作为唯一选中会话事实源；resume 现在是原 session 原地恢复，不再走 `resolvedSessionId`/redirect 兼容链
- session detail 只允许沿 `sessions query cache -> useSession() placeholder seed -> SessionChat stable shell` 这一条路径衔接；普通站内导航时，detail query 未完成也要保持 header/body 壳体稳定，只在壳体内部显示局部 pending；`chat.tsx` 现在还会在 route param 切换时保留上一个稳定 chat surface，直到新 session 的首帧真正 ready 后再原子接管，避免 detail unresolved / placeholder pending 时先闪回 route-level blocking fallback；一旦进入 `SessionChat`，detail/workspace pending 都必须留在壳体内部的局部 skeleton，不再回退到第二层 centered blocking hero、额外 route wrapper 或整页 `LoadingState`
- `useSession()` 的 placeholder seed 现在优先级是 `query cache -> warm session snapshot -> sessions summary`；只要已经拿到完整 warm snapshot，聊天壳体就不该再因为 detail query 仍在后台对齐而重新掉回 workspace pending
- PWA service worker 的 precache 现在只保核心 app-shell 资产；`vendor-terminal` / `vendor-syntax` / `vendor-assistant-runtime` / `vendor-assistant-primitives` / `ShikiCodeContent` 这类非核心重模块都不再进 app-shell precache，避免更新、冷恢复和 runtime asset reset 把重 chunk 一起拖进来
- route-level lazy 的 `SessionsShell-*` 也不再进入 app-shell precache；列表壳继续按真实路由访问时加载，不再在 service worker 安装阶段回卷成“伪核心资产”
- 聊天页首次挂载继续遵守“稳定壳体先显示，消息快照后台补齐”的 owner：已有会话的普通站内导航只允许被 `sessionDetailRoutePreload.ts` 里的 critical module preload 阻塞；`session detail query` 和 `latest messages` 只能作为后台 warmup 并行推进，失败也不能拖住导航。`SessionChat` 里仍只保留一层 page-internal `Suspense` 作为 runtime lazy owner，不再把“等待最新消息”升级成切页前的硬门槛
- sessions 列表上的 hover / focus intent preload 继续只做轻量 route chunk + session detail 预热；触屏点击会在 `pointerdown` 时提早启动同一条预热 owner，但列表扫过和 idle path 仍然禁止预热 `latest messages` 或多条 workspace，避免滚动过程把多条 message window / chat runtime 提前灌进内存
- placeholder seed 不允许只带半套配置；只要 detail 首屏 controls 依赖某个 live config，sessions list snapshot 和 realtime summary patch 就必须同步带上同一字段。当前最小集合是 `model / modelReasoningEffort / permissionMode / collaborationMode`
- 附件本地 ID 统一走运行时安全的 `createRandomId()`，不再假设移动端/PWA 一定支持 `crypto.randomUUID()`；选图预览、上传与最终发送共用同一条附件语义
- 权限审批与模式切换
- 聊天输入框当前只保留 `附件 + 控制 + 发送/停止` 三个主动作；模型、推理强度、权限模式、协作模式与切远程统一收进同一个 controls 面板；文件与终端入口统一放到右上角 `更多` 菜单
- `VibyComposer` 首屏只保留基础输入链和主动作；controls 按钮显隐继续走 `useComposerControlsVisibility.ts`，真正的 controls overlay 与 live config section 组装则延后到用户显式打开时，再由 `ComposerControlsOverlay.tsx -> useComposerLiveConfig.ts -> composerPanelSections.tsx` 挂载，避免把非核心设置逻辑重新拖回聊天页首开
- composer suggestions / controls 这类需要越过 composer shell 的浮层统一走 `ChatInput/AnchoredFloatingOverlay.tsx` 的 anchored portal owner；不要再把它们以内联 absolute 方式挂回 `contain: paint` 的 chat shell 里
- composer 发送只保留显式按钮和本地快捷键控制器这两条路径；`ComposerPrimitive.Root` 不再承担隐藏提交职责，避免移动端/IME 原生 submit 绕过本地输入控制
- 桌面键盘路径统一为 `Enter` 换行、`Cmd/Ctrl+Enter` 发送；IME composition 期间禁止提交，避免输入法选词误发；键盘判定 helper 统一收口在 `web/src/components/AssistantChat/composerKeyboard.ts`
- 聊天区的滚动 owner 已按平台收口：桌面与宽屏继续使用“header + 单滚动线程 + 独立底部输入区”固定壳体；移动端 chat 路由保持 `VibyThread` 作为唯一滚动视口，再配合 fixed composer footer，避免 iOS Safari/PWA 在多套 scroll owner 与透明底部补丁链之间继续漂移
- `SessionChat` 根节点必须直接占满 detail viewport 高度：聊天页当前契约是 `SessionChat -> h-full -> SessionChatWorkspace -> VibyThread viewport`；不要再依赖 `sessions-detail-route-transition` 这类 block 容器上的 `flex-1` 去“猜”可用高度，否则 chat page 会按内容高度膨胀，thread viewport 失去 scroll owner 身份，历史跳转再精确也会越点越偏
- `atBottom` 与 `pinned-to-bottom` 现在明确拆成两条语义：前者服务于 pending/new-message UX，后者只服务于 DOM 自动滚底；不要再把“接近底部”的 UI 状态直接拿去驱动流式滚动写入
- pinned-bottom 的自动贴附现在和 history anchor 一样走 `useThreadViewportAlignment.ts` 的短生命周期对齐事务：进入会话、messages commit、stream commit 与发送触发的 force scroll 只要仍然 pinned，就会在 commit 后继续用 `ResizeObserver + requestAnimationFrame` 守住底部；用户手动离开 pinned-bottom 后必须立即释放这条事务，不能和手势滚动抢控制权
- 顶部历史按钮现在是双模式：远离顶部时显示“上一条你发的消息”，始终命中当前 viewport 之前更早的最近一条用户消息，不再先回到当前这条超长 user message 的顶部；无论 target 已经加载还是需要隐藏批量补历史，最终都会收口成同一条短生命周期 history transaction：先做 target-first alignment，再在短窗口里用 `ResizeObserver + requestAnimationFrame` 继续守住目标，同时锁住后续 history click，直到事务 settle，避免第一次只落到 user 附近、第二次又从瞬态 assistant/tool anchor 重新起跳；如果 prepend 后数据里的 target 先到了、但 `AssistantRuntimeProvider` 里的 DOM 还要等下一拍 `useEffect` 才挂出来，这条 transaction 也必须继续等待 target DOM insertion 再对齐，不能在“ordered ids 已含 target、DOM 还没挂出来”的瞬间提前判失败；顶部 reserved inset 也继续只由 viewport 状态派生，避免跳到最早用户消息时按钮瞬间消失把对齐冲掉；靠近顶部阈值时显示“更多消息”，只 prepend 一页并保持点击前 anchor id + offset；对齐统一收口在 `useThreadViewportAlignment.ts`
- history transaction 的释放条件现在也收口成“最后一次布局变化后的静默窗口”，不再从首次 landing 起按固定时长直接放手；否则像 `content-visibility` 复测、Shiki 代码高亮、延后 markdown/code block 重排这类慢一点的异步布局，会在 target 已经贴顶后继续把它往下挤，表现成“有时停在页面中间”
- 代码块渲染已经收口到 `CodeBlock -> code-block/CodeContent -> shiki.ts` 单一路径：纯文本/json/stdout/stderr 默认继续走 plain renderer；markdown fenced code、文件查看与 diff 等真正需要高亮的场景才会按需加载 `Shiki` runtime、theme 和 language，避免把高亮初始化重新拖回首屏路径
- history target 的“贴顶”容差现在和“顶部锚点判定”明确拆开：锚点解析仍允许小量几何抖动，但真正 landing 到目标消息时只接受接近 `0px` 的偏差，避免把“离顶部还差几像素”误判成已经对齐
- 线程消息默认仍保留 `content-visibility: auto` 性能优化，但只要进入 history transaction，就必须临时切回完整布局测量；否则浏览器会先用 `contain-intrinsic-size` 占位高度估算尚未真正渲染过的历史区，导致“第一次跳到未加载区域只落到附近，之后再跳就准”的假象
- 线程内的浮动控件继续只认 `VibyThread` 这一层 surface：顶部 history control 在桌面保持居中 pill，但移动端会切到右侧上四分之一附近的细长垂直 rail；底部 CTA 在桌面保持圆形 icon-only，但移动端会切到右侧下四分之一附近的同风格 rail。两者逻辑仍分别只消费 `useThreadViewport` 的 `historyControlMode/isHistoryActionPending/isHistoryControlVisible/isAtBottom/scrollToBottom`，不会再长出第二套滚动 owner；移动端线程内容同时预留右侧 rail gutter，避免按钮压住正文
- 底部 rail 的稳定性现在也和顶部拆清了：默认挂在固定右侧下 rail，只在键盘真实打开时才退避到底边安全区；它的进场动画也改成只做 `opacity + scale`，不再复用带 `translateY` 的顶部 keyframe，所以不会再出现“按钮自己往下掉一下”的假位移
- 移动端聊天页的垂直密度已收口到同一套 header/composer 规则：运行中 idle 不再显示“待输入”徽标，底部输入卡更贴近屏幕底边，把更多高度留给线程本身
- 移动端 PWA / 浏览器聊天页的底部输入区现在走“根路由事实源 + 单线程滚动视口 + fixed footer”单一路径：`App` 会把当前路由投到 `html/body[data-viby-route]`，移动端命中 `session-chat` 时继续由 `VibyThread` 维持唯一滚动视口；`SessionChatWorkspace` 只把 `isStandalone / isKeyboardOpen / bottomInsetPx` 投给 chat shell，composer 固定在 `bottomInsetPx` 之上，线程视口则按 `composerHeight + bottomInsetPx` 预留完整遮挡高度
- `useChatViewportLayout.ts` 现在只负责键盘遮挡读模型：以稳定的 layout viewport 基线对齐 `VisualViewport`，并在遮挡量大于 safe area 时才扣掉 iOS / WebKit 额外注入的底部安全区；普通导航过渡进行中如果当前并没有编辑态焦点，它会继续冻结上一拍非编辑布局，避免地址栏/浏览器 chrome 在切页窗口里把 chat 几何再抖一轮；它不再承担第二套 chat scroll owner 或 safe-area filler 状态机
- composer glass surface 统一走同一套 token：网页和 PWA 都使用 `--ds-composer-surface-bg` / `--ds-composer-shell-edge-bg` + `-webkit-backdrop-filter/backdrop-filter`；移动端 `session-chat` route 的 app canvas 由 `html/body + app-shell/page/layout` 持有 `var(--app-bg)`，避免透明底部直接漏出 `html` 白底
- 浏览器模式下 `session-chat-composer-shell` 不再额外保留底部 gap；standalone / PWA 才会追加一条更紧凑的外部 safe-area 间距，并由 shell 自己的覆盖层把这段 gap 盖成 app canvas，避免线程内容从玻璃 footer 下方继续透出来
- `web/index.html` 的 viewport meta 保持最小兼容集合：继续只声明 `viewport-fit=cover` 等稳定字段，不再依赖 `interactive-widget` 这类 Safari/WebKit 尚未稳定支持的 hint 来修补聊天底部几何
- 移动端 chat footer 的 composer surface 继续用 `surface -> shell-edge` 的纵向渐变，位置仍贴底，但底部会比顶部更实一点；这样 safe-area 过渡不会再被看成“底下还空着一块”
- `新回复` 徽标与卡片 attention tone、`处理中 / 待输入 / 已关闭 / 已归档` 的实色 surface/badge tone 统一走 design-system token，不再散写主题翻转色、边框态或错误态近色
- 停止按钮区分 `Stop` 与 `Stopping`；前端不再把“abort 请求已发出”误表现成页面刷新
- 核心交互 surface 现在统一收口到 `Button` / `PressableSurface` primitive：按钮、tab、菜单项、快捷键、机器卡片、新建会话 agent/type 胶囊都复用同一套 press / release / pointer glow 动效与 reduced-motion 降级；按钮类默认走 `pressStyle="button"`，会话卡片、机器卡片和其他 card surface 统一走 `pressStyle="card"` 并关闭 pointer glow，不再让 composer、header、session list、settings、install prompt、new-session 卡片各自散写一套点击反馈
- 会话内 live config 能力统一由 `shared/src/sessionConfigSupport.ts` 判断；Web 不再自己猜哪些 flavor / 状态能热切换
- remote Claude / Codex / Gemini 的模型切换都从下一轮 turn 生效；思考强度继续只对 Claude / Codex 暴露；当前正在执行的那一轮不会被中途改写
- 远程终端与文件查看
- PWA 安装、离线提示、Web Push
- 安装提示统一复用 `lucide-react + @lucide/lab` icon 体系；Chromium 原生安装与 iOS 手动引导共用一套 banner / guide 组件语义
- 安装提示装配层统一收口到 `web/src/components/InstallPrompt.tsx`，展示件收口到 `web/src/components/InstallPromptContent.tsx`，installability 判断统一走 `web/src/hooks/usePWAInstall.ts`，避免页面里散落第二套安装判断
- 安装提示与设置页语言共用同一 i18n 事实源；跟随系统时会读取浏览器语言，并在 `languagechange` 后即时更新
- Web Push 权限与订阅状态统一收口到 `web/src/hooks/usePushNotifications.ts`；`AppRealtimeRuntime.tsx` 只负责在“已经授权”的设备上静默校验/补齐订阅，不再自动请求权限
- 通知入口统一收口到设置页 `Notifications` 分组；用户显式点击后才会调用 `Notification.requestPermission()`，不再在登录或首屏加载时弹系统权限框
- iPhone / iPad 上的通知文案与能力提示继续只认“已安装到主屏幕的 standalone web app”；本地、局域网、Tailscale、`.local` 和其他非正式入口仍明确视为不可推送环境
- 设置页与新建会话页共用同一套 route header 骨架；设置页分组统一收口到 `SurfaceGroupCard`，每组标题放回卡片内部；行级下拉统一走 `SettingsSelectCard` 的 disclosure 动效，页面始终保留原生纵向滚动
- 机器列表与远程创建会话
- 新建会话页仅显示当前在线机器；离线节点会被明确展示为空态说明
- 新建会话页会记住上次使用的代理、模型、思考强度、会话类型和 YOLO；再次创建时直接以同一套启动设置预填，避免每次重复选择
- 新建会话页的目录输入保持唯一事实源；项目选择器只负责把“最近路径 / 当前机器已知项目 / 目标机器目录浏览”回填到输入框，避免再造第二套目录状态
- 目标机器若还没重连到支持目录浏览的新版本 Viby，项目选择器会优雅降级为快捷项目入口，不再把“能力缺失”直接放大成 `500`
- 会话聊天控制器、新建会话页、终端、文件与高亮链路按页懒加载，避免把会话级 hooks 提前塞进主入口
- app boot boundary 现在显式拆成 `App.tsx -> AppController.tsx -> AppRealtimeRuntime.tsx`：`App` 只保留最小启动壳，`AppController` 负责 auth / serverUrl / route viewport 边界，并且只在进入已登录态后才挂 `NoticeProvider`；只有真正进入已登录态后才会加载 realtime / recovery / push runtime；`/sessions` 列表壳、chat route 都已经是 route-level lazy chunk，不再把会话工作台常驻进 boot 入口
- app entry 的可见加载 owner 现在只认 `web/index.html` 的 boot shell；React 内部不再额外渲染一层 `Authorizing / 认证中` 阻塞页去混淆登录页懒加载、auth refresh 和真实阻塞态
- boot shell 的退出时机现在也只认真实页面入口自身：`AppController` 不会再在 `token/api ready` 时抢先退壳；登录页、sessions index、new/settings/files/file/terminal 这些入口都在页面 mount 后自行释放，而 chat 只会在 `SessionChat` 的 stable shell 真成立后才释放 boot shell，避免 `boot shell -> route fallback` 再串出第二层可见 loading owner
- boot/auth 主路径现在也已经和完整 session API 解耦：`useAuth.ts` 与 `LoginPrompt.tsx` 只消费轻量 `authClient`，完整 `ApiClient` 改成 token 就绪后再动态加载；这样继续保住 `ApiClient` 单一 public API，但不再让非首屏 session/machines/workspace 能力跟着认证链常驻进主 `index`
- locale 词典现在按当前需要加载：`i18n-context.tsx` 继续是 locale 判定与切换的单一 owner，`en / zh-CN` 都由 `i18nCatalog.ts` 统一按需缓存和加载；当前 locale 会在 boot 前预热，因此不会再为了同步 fallback 把英文词典常驻进主入口
- 聊天页保持“chat route chunk 懒加载 + route 内 page-internal lazy runtime”单一路径：`SessionChatWorkspace` 在 `SessionChat` 内按需挂载，终端页的 `TerminalView` 仍是进入页面后再动态导入
- `ApiClient` 继续保持单一 public API，但 push / machines / workspace files / autocomplete 已拆成按需 helper chunk；这些 helper 与 `message-window-store / sessionQueryCache / route detail runtime / locale chunk` 都不再回卷进 app-shell 主入口
- `message-window-store` 现在已拆成 `messageWindowStoreCore + messageWindowStoreAsync`：chat route 首帧只静态消费同步订阅/状态 owner，最新消息抓取、分页恢复与 catch-up 则统一后移到 async chunk，并继续通过共享 loader 管理；`sessionQueryCache.ts` 和 `sessionViewRuntime.ts` 也不再各自维护第二套模块 promise
- `SessionChat` 现在只负责 header、detail pending shell 和 workspace lazy owner；其中 detail/workspace pending 已统一成稳定壳内的局部消息 skeleton，而不是第二层 blocking hero；workspace 内部的消息块归一化/重排、composer live config 控制和 thread view-model 已收口到 `useSessionChatWorkspaceModel -> useSessionChatBlocks / useSessionLiveConfigControls`，避免 route shell 和 workspace 再互相吞职责
- `SessionChatWorkspace` 本体现在也继续拆成“轻壳 + 子块”：`VibyThread`、`VibyComposer`、`ComposerDraftController` 都已后移成 workspace 内部按需 chunk，并在壳内各自使用局部 fallback；这样会话首开不再被一个 100KB 级工作台大块整体卡住，而是先稳定进 workspace shell，再并行接管 thread / composer
- chat route 的 workspace preload 现在也只保留 `SessionChat` 一条 owner；`useSessionChatRouteModel.ts` 不再重复维护第二份 `loadSessionChatWorkspaceModule()` effect，避免同一条 preload 语义在 route model 和 shell 两头散写
- `TeamPanel` 已从 `SessionChat` 热路径后移成按需 chunk；只有会话真的带 `teamState` 时才加载，同时 `TeamPanel-*` 也不会再进 app-shell precache
- `VibyComposer` 继续只保留基础输入、附件和主操作 eager 路径；controls 是否显示统一走 `useComposerControlsVisibility.ts`，而实际 settings overlay 改成 `ComposerControlsOverlay` 按需加载，避免会话首开就为了模型/权限/协作面板初始化整条控制链
- 会话列表顶部品牌位、route-level loading hero、登录入口、sessions 空态与静态 boot shell 现在统一消费生成后的 `brand-logo-tight.png` 主符号：header 只展示纯 mark + `Viby` 标题；登录、workspace loading、sessions 空态与 boot shell 统一改成亮暗自适应的黑白单色 mark，不再保留 lime tint、暖色 halo、额外 badge 壳或第二套歪斜 SVG；web favicon 继续用透明主符号，PWA / apple-touch 图标也改成无内嵌卡片的放大主符号，不再额外包白边、描边或浅色底板；品牌脚本也会主动删除 `brand-browser-icon.png`、`brand-logo.png`、`brand-mark.svg` 这三类遗留 web 产物
- 聊天文本渲染现在已经收口到 `chat/textRenderMode.ts -> reducerTimeline/useSessionChatBlocks -> assistant-runtime metadata -> TextContent` 单一路径：`user-text` 固定写入 `renderMode: plain`，`agent-text` 在 reducer 阶段一次性决定 `plain / markdown`，view 只消费 contract，不再各自扫描正文猜测富文本
- `MarkdownPrimitive` 也继续做了渐进增强拆分：基础 markdown 渲染先走最轻 owner，`remark-gfm` 与增强组件配置已后移到 `markdownConfig-*` 子块按需加载；这样普通正文会更早显示，而表格/代码块复制/GFM 增强在 config chunk 到位后再接管，不再把整套 markdown config 常驻在主 markdown runtime 里
- assistant 消息按 contract 分层：普通纯文本回复继续走 `PlainAssistantMessageContent`，只有 `renderMode: markdown`、reasoning 或 tool-call 时才 lazy 加载 rich message 内容；CLI 输出详情卡仍通过 `CliOutputMessageContent` 延后到真实命中该类消息时再加载 `CliOutputBlock` / dialog，避免低频链路常驻聊天首包
- ToolCard 结果渲染也不再保留 `auto` 模式：默认文本结果回到 plain，只有 `Task / WebSearch / WebFetch / ExitPlanMode` 这类 markdown-only view 显式走 markdown，json/html 字符串继续走 code fallback，避免工具结果在消费端再做第二轮富文本猜测
- `ToolCard` 的低频视图注册现在通过 `ToolCard/lazyViews.tsx` 按需加载；`views/_all` 与 `views/_results` 已从聊天热路径顶层导入里后移，fallback 继续复用本地 inline/result 渲染，避免首屏为低频工具视图额外拉整组模块
- `/sessions` 列表壳现在也已经从 `router.tsx` 主入口静态导入里移出，首个列表路由改成独立 `SessionsShell-*` chunk；app-shell 主包只保留 boot / auth / route table owner，不再常驻列表渲染与 idle warmup 逻辑
- sessions 壳层只在 idle 且网络条件合适时预热 `new / settings` 与单条候选会话的 detail-only snapshot；列表空闲态禁止预热 `SessionChatWorkspace` 和 latest messages，显式进入目标会话时也只允许在后台 warmup 这类 workspace/message runtime，避免 message window / chat runtime 提前灌进内存
- `sessionRoutePreload.ts` 现在只保留轻量 route/module loader 与 idle preloader；session detail 的预热 owner 已拆到 `sessionDetailRoutePreload.ts`，其中 critical preload 只负责 route commit 必需模块，detail query / latest messages / workspace runtime 则统一后移到交互时才 `import()` 的后台 warmup，避免 `router.tsx` 通过顶层导入把 detail runtime 重新卷回主 `index`
- chat route 的消息窗口 owner 也继续减重：`useMessages.ts`、`useSendMessage.ts`、`sessionChatRouteRuntime.ts` 只直连同步 `messageWindowStoreCore`；只有真实需要 latest messages、load more、catch-up 时才通过 `messageWindowStoreModule.ts` 动态拉起 `messageWindowStoreAsync`，避免 session 首帧为了分页/恢复逻辑额外下载整块消息 I/O runtime
- sessions 列表到聊天页的普通客户端导航不再按完整 `pathname` 把右侧 detail surface 整面 remount；同时会在 hover / focus / click 时并行预热 chat detail route chunk 和 session detail query，减少“先整页空一下再回来”的闪屏
- 离开会话路由时，`SessionsShell` 会继续统一释放 message window、session stream 与 session-scoped queries；query policy 只认 `sessionDetailQueryOptions.ts`，运行时清理只认 `sessionViewRuntime.ts`，不再保留额外 re-export 壳，也不靠长 `gcTime` 等被动回收
- service worker 的非关键 precache 过滤名单也会同步排除 `messageWindowStoreCore-*` 和 `messageWindowStoreAsync-*`，避免这次拆出的 chunk 被重新塞回 app-shell precache
- 同一条 non-critical precache 过滤名单现在也覆盖 `VibyThread-*`、`VibyComposer-*`、`ComposerDraftController-*`、`ComposerControlsOverlay-*`、`RichAssistantToolMessageContent-*`、`CliOutputBlock-*`、`TerminalView-*`、`filesPageViews-*`、`MarkdownRenderer-*`、`ToolCard views _all/_results-*` 和 `markdownConfig-*`，避免新拆出的按需 chunk 被 service worker 重新卷回 app-shell
- 普通 sessions 站内导航统一复用 `web/src/lib/navigationTransition.ts` 这条 retained navigation helper，但 session list 里的显式选中现在已经收口成“critical preload settle -> transition commit -> background warmup”；点击进入时只等 route commit 必需模块，不再等待 detail query / latest messages / workspace runtime，也不再把 assistant rich reply / markdown 渲染链塞进 critical path。`SessionChat` 自己只在稳定壳体内部接管 workspace lazy fallback，因此即使 workspace chunk 仍在下载，也只显示同一套局部消息 skeleton，不会再退回第二层 app-level loading owner。`new / settings`、chat header 里的 files/terminal 跳转，以及 files 内部 tab/file 切换继续复用同一套 recovery href 与 transition options。chat route 的 retained handoff 现在也只保留单层兜底：目标 session 没 ready 前继续显示上一张稳定 chat surface，一旦新 session 达到最小可显示条件就直接原子切换，不再叠一层 exiting overlay 做二次淡出，避免正文肉眼出现“双闪”。列表 idle warmup 则只允许做无意图的数据/模块预热，不再携带 `recoveryHref` 去声明用户恢复目标，避免后台预热偷走真实点击意图。支持浏览器 `View Transition` 时只叠加视觉增强，但编辑态焦点存在时会主动降级回 retained navigation，避免移动端键盘与 viewport 几何在切页时放大闪动；窄屏移动端现在也直接退出浏览器级 `View Transition`，改由同一 `data-viby-navigation-transition` 状态源驱动 list/detail 的轻量 enter motion；不支持或用户偏好 reduced motion 时也仍回到同一 retained navigation 主路径，不会分叉出第二套 pending 状态机
- files/file 路由也继续遵守同一条“可见壳先到、重内容后到”路径：`files.tsx` 默认 `changes` tab 不再静态拖入 `DirectoryTree`，只有切到目录时才加载目录树 chunk；`file.tsx` 则改成 `diff-first`，只有 diff 不可用、没有改动，或用户显式切到 `file` tab 时才发 `readSessionFile` 请求，`CodeBlock`/高亮也后移到 `fileContentView-*` 子块。`filePageUtils.ts` 只保留扩展名别名映射，不再为了语言判断静态依赖 `lib/shiki`
- app shell 根层不再平行叠一套 `AnimatePresence/motion` 路由淡入淡出；全站导航过渡只保留 `web/src/lib/navigationTransition.ts` 这一条正式路径，避免重复 owner 和首屏常驻 runtime
- 如果用户在列表点击会话 / 新建 / 设置前的 preload 恰好命中旧 chunk，recovery 现在会记住这次用户意图并在 reload 后继续回到目标 href；列表项的 hover / focus 意图预热也复用同一条 recovery target 语义，不再偷掉第一次点击
- route fallback 不再使用重型 loading 卡片；重要的 app/route 级接管只保留单 icon + 标题 + 可选简短描述，files/file/thread skeleton 则共享同一 shimmer token，减少视觉层级和多套装饰
- `router.tsx` 只保留路由表；`routes/sessions/SessionsShell.tsx` 承载列表壳与 idle preload，`routes/sessions/chat.tsx`/`new.tsx` 负责页面控制器
- 生产态若命中已删除的旧 chunk，会通过 `vite:preloadError` 走统一 runtime recovery 链恢复；只有这类已确认的 runtime asset 故障才会触发整页 reload
- build id 变化时会先清理 runtime caches 并继续保留当前页面，而不是默认再来一次二次硬刷新；真正需要 reload 的场景会保留 recovery reason 并用启动过渡壳平滑接管
- `runtimeAssetRecovery` 与 `index.html` 启动前 inline recovery 只允许对“模块加载失败 / 缺 chunk / 旧 asset 路径”这类已确认的 runtime asset 故障做 reload；不要再把通用 `before initialization` 之类 production runtime exception 误判成 stale asset，否则会把真实错误刷成无限恢复循环
- runtime asset 链路现在按职责拆成 `runtimeAssetPolicy -> runtimeAssetFailure -> runtimeAssetRecovery`：origin / SW 策略、故障识别、reset/recovery 分开收口；`vite:preloadError` 的故障判定也后移到事件回调动态加载，不再把低频失败链常驻进 boot 热路径
- service worker / runtime update 注册已从 `main.tsx` 的主 boot path 后移到 `boot/registerRuntimeServiceWorker.ts`；首屏仍先完成 recovery / render，再在 idle 时挂 SW/update 注册，避免把非首屏必需的 update runtime 常驻进主入口
- PWA 新版本就绪时不再弹阻塞式 `confirm()`；统一走应用内 floating notice，用户点击后才切到新壳，失败也会保留入口以便重试
- 普通 runtime update notice 不会自行强刷当前页面；只有已经确认的旧 chunk / runtime asset 故障恢复，才允许接管成整页 reload
- runtime/update/recovery notice 已收口成单一 owner：页面资源切换相关的 `build-assets-reset / local-service-worker-reset / vite-preload-error / runtime-asset-reload` 对用户统一表现为一类“页面资源刚更新”提示；本地/局域网静态入口只补一条克制的 build 提醒，不再并排冒出多种底层术语
- 只有非本地 `https` origin 才会注册 service worker；`127.0.0.1`、局域网、Tailscale、`.local` 这类开发地址默认禁用 SW，避免旧壳继续接管页面
- `routes/sessions/*` 采用共享页面骨架、状态条与纯函数工具，主页面仅保留装配；`SessionRouteHeader` / `SessionRouteTabs` 负责 files/file/terminal 的统一 chrome，终端页的按键条与 socket/resize/exit 生命周期分别收口在 `terminalQuickInput.tsx` 和 `useTerminalPageController.ts`
- 设计系统统一走亮暗双主题 tokens、`lucide-react + @lucide/lab` icon 体系、统一 motion 语言与黑白极简产品表面
- 图标规范：新增 Web UI icon 统一从 `web/src/components/icons.tsx` 入口导出，默认只使用 `lucide-react + @lucide/lab`，不要混入其他 icon pack
- 宽度策略已拆成两层：`ds-stage-shell` 负责聊天/终端/文件的主舞台，`ds-page-shell` 负责偏表单型内容；消息层再通过统一 message width classes 控制工具卡、CLI 卡与系统提示的展开方式

## 登录方式

- 普通浏览器：使用 `CLI_API_TOKEN`
- 自定义 hub 地址：登录页右上角可切换 hub origin
- 浏览器会按 hub origin 复用未过期 JWT，刷新页不再每次强制重新走 `/api/auth`
- 登录后通过 JWT 持续刷新认证状态
- Web 实时连接不会因为 JWT 续期主动自断；下次握手才会带上新 token，减少无意义重连
- 浏览器里会保留最近一小段 `window.__vibyRealtimeTrace`，除了 `connect / disconnect / connect_error / sync`，还会记录 `spawn_success / chat_opened / message_send_start / server_accepted / thinking_visible / first_stream_delta / first_reply_detected`

## 技术栈

React 19、Vite、TanStack Router、TanStack Query、Tailwind、assistant-ui、xterm.js、Workbox。

## 开发

```bash
bun install
bun run dev:web
```

桌面开发态会由 `tauri dev` 自动拉起这条 Vite dev server。
开发链路不额外先跑 `vite build`；只有构建或打包时才走 `build:web` -> `web/dist`。

如果你是通过根目录 `bun run dev:remote` 联动调手机：

- `5173` 是 Vite 开发页入口
- `37173` 是 hub、API、Socket.IO 与静态入口
- 日常开发默认只进 `5173`；`37173` 主要用于 hub 直连、静态入口和更接近生产态的 smoke/debug
- Web 会默认按当前页 hostname 直连同主机的 `37173` hub，不再依赖 `?hub=`
- 这意味着 `5173` 下的 session rename / delete 等操作是真正的跨源 HTTP；Hub 侧必须同时放行 `authorization + content-type` 头和 `PATCH / DELETE` method，不能只放 GET/POST
- `?hub=http://<目标地址>:37173` 只保留给显式覆盖到另一台 hub 的场景
- 如果 hub 也开了 watch，当前实现会优先复用稳定 socket 宿主并原地替换 runtime；页面端只在必要时走统一 recovery，不再把 dev watch 当成整页重建信号
- 如果你打开的是 `37173` 这条 hub 静态入口，而不是 `5173` 的 Vite dev 页，前端改动要先执行 `bun run build:web`；`37173` 在当前开发链路下消费的是 `web/dist`，不会像 `5173` 一样直接吃 HMR

## 构建

```bash
bun run build:web
```

构建产物输出到 `web/dist`。

如果你要看这次 build 的体积排名和预算护栏结果：

```bash
bun run build:metrics
bun run build:budget
```

报告会输出到 `web/dist/reports/build-metrics.{json,md}`。

- `build:budget` 当前会显式检查：
  - 主 `index` JS/CSS
  - `vendor-terminal`
  - `vendor-assistant-runtime`
  - `vendor-assistant-primitives`
  - `markdown-runtime`
  - `shiki-code-content`
  - `use-reduced-motion` 必须缺席
- 当前已把 `new/settings` 低频链路里的 `motion/react` runtime 移除，展开交互统一收口到原生/CSS 组件
- terminal runtime 默认路径也已去掉 `@xterm/addon-canvas`：当前只保留 `xterm + fit + web-links` 作为功能必需 owner，避免为了默认 DOM renderer 的可选性能 fallback 把额外渲染器常驻进 `vendor-terminal`
- markdown 渲染配置与 code surface 现在也继续收口成共享 owner：`web/src/components/markdown/markdownConfig.tsx`、`web/src/components/markdown/MarkdownPrimitive.tsx`、`web/src/components/code-block/CodeSurface.tsx` 负责统一配置与外壳，`MarkdownRenderer`、assistant rich text、reasoning、`CodeBlock` 和 assistant syntax highlighter 都复用它们，不再各自维护第二套拼装
- `TextContent` 现在也遵守单一路径 Hook 规则：plain / markdown / auto 会先统一算出 `renderMode`，不再在条件返回后调用 `useMemo`
- `ShikiCodeContent` 高亮现在只加载当前活跃主题，并复用同 theme/lang/code 的渲染结果缓存；不会再为当前页面一次性预载 light + dark 两套主题
- 当前 `build` 会先让 `vite-plugin-pwa` 编译 `src/sw.ts`，再由 `web/scripts/finalizeInjectManifest.ts` 后置注入 precache manifest；这是为了绕开 `vite-plugin-pwa@1.2.0` 和 Workbox 7.4 在同文件注入上的构建冲突，同时继续保留现有 custom service worker owner
- `web/src/sw.ts` 的 runtime cache 现在只保留一条明确规则：只缓存命中允许状态码的成功响应；API / 同源可选 chunk 默认只缓存 `200`，跨源 CDN runtime cache 允许 `0/200`，避免把 `404/500` 之类失败结果写进 cache
- app-shell precache 的非关键过滤名单现在也已对齐真实输出 chunk：`SessionsShell-*`、`sessionDetailRoutePreload-*`、`MarkdownPrimitive-*`、`ShikiCodeContent-*`、`TeamPanel-*`、`RichAssistantToolMessageContent-*`、`registerRuntimeServiceWorker-*`、`usePWAInstall-*` 等后移 runtime 不会再因为名字漂移被误放回 precache
- 同一条 non-critical precache 过滤名单现在也继续覆盖 `DirectoryTree-*`、`fileContentView-*`、`ComposerControlsOverlay-*`、`TerminalView-*`、`MarkdownRenderer-*`、`FloatingActionMenu.contract-*` 与 `workbox-window.prod.es5-*`，避免 files/file/chat/terminal/PWA 这轮新拆出的子块被 service worker 重新塞回 app-shell
- 2026-03-25 这轮 code-simplifier closeout 后，fresh `build:metrics` 结果为：主 `index` `325.44 KiB raw / 103.16 KiB gzip`，`vendor-terminal` `325.44 KiB raw / 82.15 KiB gzip`，PWA precache 收到 `67 entries / 1389786 bytes`
- 2026-03-25 这轮 fresh `build` 下，之前记录的 `runtimeAssetRecovery.ts` mixed import warning 没有复现；当前构建热点仍优先看真实 chunk 体积，而不是假设这条恢复链需要额外拆分
- 2026-03-25 当前这轮继续收口后，主 `index` 已进一步降到 `325.36 KiB raw / 103.13 KiB gzip`；相比上轮 `332.38 / 104.78 KiB`，说明 boot/auth 从完整 `ApiClient` 中拆开加上后续收口是实际收益，不是“结构更整齐但包体没变”
- 同一轮继续拆 terminal 后，`vendor-terminal` 也已从 `418.58 KiB raw / 105.62 KiB gzip` 降到 `325.44 KiB raw / 82.15 KiB gzip`；当前收益来自删除默认路径里的可选 canvas renderer，而不是继续新增 chunk 岛
- 同一轮继续收窄 assistant markdown owner 后，assistant markdown 相关依赖也已从 session 热路径退出；`@assistant-ui/react-markdown` 与 `remark-gfm` 不再被 `vendor-assistant-runtime` 常驻绑进聊天热路径，而是回到 markdown runtime 自己承接
- 同一轮继续收口 chat 热路径后，`chat-*` route chunk 也已从 `7.29 KiB gzip` 降到 `6.49 KiB gzip`；收益来自删除重复 workspace preload owner，并把低频 `TeamPanel` UI 从聊天首开路径后移，而不是新增新的 vendor split
- 同一轮继续做 false-lazy closeout 后，`SessionHeaderActionMenu` 只会在点击更多菜单时才导入，`InstallPrompt` 也只会在 app chrome 空闲时才导入；当前 fresh `build:budget` 下，这两个低频 surface 仍保持独立 chunk：`SessionHeaderActionMenu` `0.73 KiB raw / 0.42 KiB gzip`、`InstallPrompt` `8.57 KiB raw / 2.46 KiB gzip`
- 当前这份脏工作区的最新 fresh `build:budget` 结果里，主 `index` 真相已经变成 `356.74 KiB raw / 113.25 KiB gzip`；因此不要再把上面的 `325 KiB` 视为“当前整仓总包体”的唯一基线。当前仍然稳定保住的是：`vendor-terminal` `325.44 / 82.15 KiB`、`vendor-assistant-runtime` `72.89 / 19.22 KiB`、`vendor-assistant-primitives` `13.02 / 4.45 KiB`、`markdown-runtime` `104.94 / 31.79 KiB`、`shiki-code-content` `146.24 / 48.19 KiB`、PWA precache `58 entries / 922462 bytes`
- 2026-03-26 继续收口 files/file 后，fresh `build` 里 `files-*` 已是 `11.89 KiB raw / 4.06 KiB gzip`，`file-*` 已是 `5.48 KiB raw / 2.28 KiB gzip`；目录树与高亮内容分别独立成 `DirectoryTree-*` `3.73 KiB raw / 1.48 KiB gzip` 和 `fileContentView-*` `0.63 KiB raw / 0.36 KiB gzip`
- 同一轮也把 file route 的默认显示模式收口为单一事实源：`search.tab` 决定首选模式，`directories` 进来默认落 `file`，其余默认落 `diff`；只有当前文件确实没有 diff 时，页面才会原子回落到 `file`，不会再一边默认展示 diff、一边偷偷把目录入口改成 file 请求路径
- 同一天继续把 assistant/runtime 与 optional precache 误收口掉之后，`@assistant-ui/react` 已拆成 `vendor-assistant-runtime-* + vendor-assistant-primitives-*` 两块，原先整块 assistant runtime 不再和 primitives 绑死；同时 `ShikiCodeContent-*`、`RichAssistantToolMessageContent-*`、`ComposerControlsOverlay-*`、`TerminalView-*`、`MarkdownRenderer-*`、`ToolCard views _all/_results-*`、PWA install/update runtime 等懒块也被从 app-shell precache 里踢出，PWA precache 从 `1280554 bytes` 连续降到 `922462 bytes`

- `manualChunks` 当前仍在 `web/vite.config.ts` 里显式保留 3 组 runtime 家族：`@xterm -> vendor-terminal`、`shiki + hast-util-to-jsx-runtime -> vendor-syntax`、`@assistant-ui/react -> vendor-assistant-runtime / vendor-assistant-primitives`；`@assistant-ui/react-markdown` 与 `remark-gfm` 继续交给 markdown runtime 自己承接，其余依赖继续交给 Rollup 自动收口
- 不要再新增新的 vendor island；如果后续要继续删减或重划现有手工切块，先同步修改 `web/vite.config.ts` 和这里的说明，再验证 static 入口不会重新引入 production-only 初始化环依赖
