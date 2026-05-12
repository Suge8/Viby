# Progress — 04-broker-forwarder

## Context Recovery Block

- **Current step**: #1 (Read SPEC + design impl)
- **Status**: TODO
- **Spec**: ./SPEC.md
- **Plan**: ./TODO.csv
- **Claimed by**: none
- **Lease until**: none
- **Next action**: 读 SPEC.md，形成实现模型，更新本文件再开始 step 2.

<!-- Append milestone entries on completion -->


## BLOCKED — 2026-05-12T18:55:00Z — Phase D

- **Blocker**: SPEC requires broker session state shrink to `active | deleted | expired`, but `PairingSessionRecordSchema` / `PairingSessionStateSchema` in `shared/src/pairing/pairingSchemaBase.ts` only allow `waiting | claimed | connected | deleted | expired`.
- **Why severe**: `pairing/src/redisStoreSessionSupport.ts` parses persisted sessions with shared schema. If Phase D writes `active`, Redis-loaded sessions fail schema parse and get deleted. Fix requires changing shared schema, which is outside Phase D `write_scope`.
- **Second scope conflict**: removing `markConnected / markDisconnected / touchConnection` requires `pairing/src/storeTypes.ts`, `pairing/src/redisStore.ts`, `pairing/src/redisStore.test.ts`, and HTTP route calls to `broadcastState/closeSession` to change; these are not in Phase D `write_scope`.
- **Tried**: inspected `ws.ts`, `wsSupport.ts`, `wsDisconnectGrace.ts`, `storeSupport.ts`, `memoryStore.ts`, `storeTypes.ts`, `redisStore.ts`, `redisStoreSessionSupport.ts`, `httpSessionRoutes.ts`, `httpPwaHandoffRoutes.ts`, and existing `ws.test.ts`; confirmed this is not a local typo.
- **Needed decision**: expand Phase D write_scope to include shared schema + store interface/redis/http route touchpoints, or change SPEC to keep legacy state enum until Phase K.

## Phase D Complete — 2026-05-12T19:25:00Z

- **What changed**:
    - Rewrote `pairing/src/ws.ts` as raw V2 signal forwarder (118 lines).
    - Removed broker websocket ready/state/peer-left/error/ping business signaling.
    - Simplified disconnect grace to GC-only.
    - Removed store online connection methods from memory/redis/store interface.
    - Added `active` session state and `migrateLegacyState()` mapping for old `waiting/claimed/connected` records.
    - Replaced websocket tests with forwarder/auth/replacement/GC coverage and added `wsForwarder.test.ts`.
- **Validation**:
    - `bun run --cwd pairing typecheck` ✅
    - `bun run --cwd pairing test` ✅
    - `wc -l pairing/src/ws.ts` = 118 ✅
    - grep `emitReady|emitState|emitPeerLeft|emitExpired|markConnected|markDisconnected|touchConnection` in `pairing/src` empty ✅
- **Real-device RM**: D/E/F staging burn-in deferred until Phase E+F complete; no prod deploy.
- **Commit**: pending.
