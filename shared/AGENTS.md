# Shared Guide

## 先看这里

- 入口先看 `shared/README.md`
- 协议 / schema / 读模型边界先看 `../docs/development/shared-contracts.md`
- 系统级单一事实源再看 `../docs/architecture/system-overview.md`
- 长任务活动路径再看 `../docs/internal/agent-workflow.md`

## Shared 硬规则

- `shared/` 是协议、schema、读模型、runtime 合同的单一事实源，禁止在 Web / Hub / AppCore / desktop 再平行维护第二套结构。
- pairing reconnect challenge / device proof / telemetry sample 合同继续只认 `shared/src/pairing/` owner。
- pairing link quality、candidate transport 归一与 `本机直连 / 安全中转 / 延迟` 展示文案只认 `shared/src/pairing/pairingLinkQuality.ts` owner。
- pairing Peer RPC request envelope 只认 `shared/src/pairing/pairingPeerRequestSchemaBase.ts` owner；禁止在 terminal / upload / extended schema 再复制 request id 或 request object builder。
- pairing binary upload frame magic/header/transferId 编解码只认 `shared/src/pairing/pairingPeerBinaryUpload.ts` owner。
- session attachment upload size limit 只认 `shared/src/attachmentUpload.ts` owner。
- session driver、runtime handles、`assistantTurnId`、pseudo-user helper 等跨模块合同继续只认 shared owner。
- same-session switch target 集合、driver model 兼容性和可选 preset 继续只认 `src/sameSessionSwitch.ts` / `src/modes.ts`；Web/Hub/AppCore 只能消费，不能各自再维护一份列表。
- Codex service tier 合同只认 `src/modeCatalog.ts` / `src/modes.ts` / `src/schemas.ts`；Web/Hub/AppCore/Desktop 只能消费，不能再维护第二份 `standard / fast` 枚举。
- `resumeAvailable / resumeStrategy` 只认 `sessionResume.ts` 同一条 owner；`sessionLifecycle.ts`、`sessionSummary.ts` 只消费，不再各自平行推导。
- provider-native resume trigger 的产品可见性只认 shared command-capability owner；`/resume` / `/chat resume` 是否隐藏、是否仍保留 lifecycle effect，只能在 shared 收口。
- pending interactive request 归一合同只认 `src/interactiveRequest.ts`；Web/Hub/AppCore 只能消费 canonical projection，禁止各自再解析一套 `AskUserQuestion` / `request_user_input` / permission prompt 语义。
- active session `processing / awaiting-input` turn-state 优先级只认 `src/sessionTurnState.ts`；Web/Hub 不得再各自重排 pending request 与 thinking 的显示顺序。
- Codex `<proposed_plan>` 特殊块归一解析只认 `src/proposedPlan.ts`；Web/AppCore 不得再各自维护第二套 plan-block 正则或标签语义。
- 新字段进入稳定主路径后，旧字段只允许保留迁移期一次性兼容，不允许长期参与运行时判定。
- `shared/` 只放跨模块合同与纯函数，不吸收具体 UI、Hub mutation 或 AppCore runtime 细节。
- 导出面保持极简；新增 public export 前先确认是否真的是跨模块合同。
- `shared/` 必须保持独立 typecheck / test 可运行，不能只靠其他 workspace 顺带覆盖。

> 各 contract owner 文件清单只认 `../docs/development/shared-contracts.md`「当前关键文件」，本文件不再平行维护第二份文件地图。

## 验证基线

- `bun run --cwd shared typecheck`
- `bun run --cwd shared test`
- 修改 `shared/src/pairing/**` 时额外跑：
  - `bun run test:it-pairing`
  - `bun run typecheck:integration`
