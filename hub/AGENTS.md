# Viby Hub Guide

## 先看哪里

- 产品入口先看 `hub/README.md`。
- Hub owner 边界看 `../docs/development/hub-owners.md`。
- 环境变量边界看 `../docs/development/runtime-environment.md`。
- 系统架构与恢复语义看 `../docs/architecture/system-overview.md` 和 `../docs/architecture/realtime-recovery.md`。
- 长任务活动路径先看 `../docs/internal/agent-workflow.md`。
- 当前任务执行细节再看 `.taskmaster/`。

## Hub 硬规则

- durable mutation 与 authoritative snapshot 必须保持单一 owner。
- archive / restore / history / delete 只认单一 lifecycle owner。
- `syncEngine.ts` 必须保持薄 orchestration owner；auto resume / unarchive / attachment wake 不得绕开 `SyncEngine` 主入口直连底层 service。
- passive notice 必须先完成 wake/resume owner，再写 durable notice；失败要 fail-fast。
- 附件上传与删除都只认 Hub `uploadFile` / `deleteUploadFile` owner；Web 不维护第二条附件预热链，Hub 只做 machine-scoped 文件落盘/清理，不得因为选图/删图偷偷恢复 session。
- 附件上传大小限制只消费 shared `attachmentUpload.ts` owner；Hub route 不得散写第二套 MB 常量或错误文案。
- spawn RPC ack 不是 session 已 ready for send 的证明；fresh start / inactive start 必须继续等待 authoritative session-state owner 观测到 `active=true`。
- session driver / resume token 只认 `metadata.driver + runtimeHandles`；store 写入时直接归一，禁止消费端继续认 `metadata.flavor`。
- `resumeAvailable / resumeStrategy` 的 durable/read-model 语义必须继续只消费 shared resume owner；Hub route/service 不得并行再算第二套恢复策略。
- provider-native `/resume` / `/chat resume` 手输命令必须继续由 Hub send gate 拦截，并指向唯一产品入口：Hub 已知会话走 History，Hub 未导入本机会话走 `New Session -> Recover Local`。
- same-session driver switch 的 config sanitize 只认 `sessionSwitchConfig.ts + SessionDriverSwitchService`；spawn 与 durable config 必须共用同一份归一结果，禁止在 route/cache/AppCore 再补第二套修正。
- session config 的 Codex service tier 只认 Hub durable `sessions.codex_service_tier` 与 `SessionConfigMutationService` 写链；route 只做输入边界和 capability gate，不再平行推导默认值。
- session lifecycle metadata 变更必须 await 同一条 `SessionCache` owner；禁止 fire-and-forget 异步写入导致 durable contract 漂移。
- session activity summary 必须物化在 `sessions` durable row 上；读取列表/摘要时禁止再扫描 `messages` 聚合第二套 activity。
- message -> session activity / updated_at 推进语义必须共用同一条 store owner，禁止在 service / socket handler 各自拼写一份。
- schema version 判定、migrate、mismatch message 与 required-table/assert 只认 `storeSchemaDefinition + storeSchemaSupport + storeSchemaMigrationSupport` 一套 owner。
- assistant transient stream 的 drop 必须只认 shared canonical `assistantTurnId`。
- 新的跨模块 schema / contract 优先收口到 `shared/`；Hub 本地 zod 只用于本地 route / socket 输入边界，不得扩成第二套共享合同。
- durable / lifecycle 写链禁止新增 fire-and-forget；store/cache/notification 主路径必须 await 同一 owner。
- 非启动 banner / 诊断 owner 禁止新增 `console.*`。
- 非测试 Hub 代码禁止新增 `typed any`

## 验证

- 跑 touched scope 对应 focused tests
- 必要时补 route / sync / store 回归
- 修改 session resume / sync sweep / pairing-adjacent recovery 时额外跑：
  - `bun run test:it-pairing`
  - `bun run typecheck:integration`
- 文档与代码一起更新
