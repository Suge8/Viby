# Web Scope Guide

## 先看这里

- 模块入口与开发命令看 `README.md`
- 开发边界看 `../docs/development/web-boundaries.md`
- 视觉 owner 看 `../docs/development/web-native-feel.md`
- realtime / recovery 看 `../docs/architecture/realtime-recovery.md`
- 浏览器证据链看 `../docs/internal/browser-observability.md`
- 长任务活动路径看 `../docs/internal/agent-workflow.md`

## 本目录规则

- Web 只消费 Hub authoritative state；session / message / config 不建第二事实源。
- route / selected-session / chat ready 只走 `route preload -> route commit -> final content`，禁止再叠第二套 delayed-ready、全屏 loading 或 raw fallback。
- 浏览器存储只走 `browserStorage`、`storageRegistry.ts`、`appCacheDb.ts`、`preloadAppCacheRuntime.ts` 对应 owner；业务代码禁止直接 `localStorage` / `openDB()`。
- `queryKeys.sessions` 写入只走 `sessionQueryCache.ts` 与 `realtimeEventController.ts`；列表 refetch / remote replacement / full-session write 都必须消费 shared summary 投影。
- transcript 主路径只认 `ChatBlock -> TranscriptRow -> react-virtuoso Virtuoso`；滚动、prepend、follow、top-anchor、fresh row、height estimate 细则以 `web-boundaries.md` 为准。
- composer / keyboard / autocomplete / slash submit 只认 `composerKeyboard.ts + useComposerInputController.ts + VibyComposer.tsx`；IME guard 不得复制。
- app 级 fixed / floating / dialog / popover 只挂 `body > #app-overlays`，禁止在 route 子树或 body 下另建 overlay root。
- remote pairing 只认 `RemotePairingController` 与 shared pairing 合同；终态 close 必须停重连并上报 fatal。
- pending Peer RPC、binary upload、link quality、close code、pairing text frame 只消费 `shared/src/pairing/` owner。
- UI primitive 优先用 `components/ui`；新 design magic 必须进 `var(--ds-*)` / `var(--app-*)` 或明确 primitive owner。
- 非显式诊断 owner 禁止新增 `console.*`；runtime async 禁止无说明 fire-and-forget。
- 非测试 Web 代码禁止新增 `typed any`。
- 行为改动必须同步更新测试与 `docs/`。

## 验证基线

```bash
bun run --cwd web typecheck
bun run --cwd web test
bun run --cwd web build
```

修改 `web/src/remote/**` 或 pairing 链路时额外跑：

```bash
bun run test:it-pairing
bun run typecheck:integration
```
