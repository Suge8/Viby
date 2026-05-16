# Progress — 06-web-peer-session

## Context Recovery Block

- **Current step**: #1 (Read SPEC + design impl)
- **Status**: TODO
- **Spec**: ./SPEC.md
- **Plan**: ./TODO.csv
- **Claimed by**: none
- **Lease until**: none
- **Next action**: 读 SPEC.md，形成实现模型，更新本文件再开始 step 2.

<!-- Append milestone entries on completion -->

## Phase F Complete — 2026-05-12T21:10:00Z

- **What changed**:
    - Wrote `raw/import-audit.md`; deleted old guest transport/negotiation/signal/liveness/foreground modules and tests.
    - Added `RemotePeerSession.ts` on shared `createPairingTransport` with foreground pulse → `transport.notifyForeground()`.
    - Swapped `RemotePairingController` from `connectRemotePeer` to `new RemotePeerSession(...); await untilReady()`.
    - Kept `RemotePeerBridge` RPC surface through `createRemotePeerBridge`; pending requests, channel messages, binary upload, and stats remain as business helpers.
    - Added `mapByeToErrorKey()` and moved `RemotePeerConnectError` into `remotePairingErrors.ts`.
- **Line budget**:
    - `RemotePeerSession.ts` 126
    - `remotePairingPendingRequests.ts` 108
    - `remotePairingChannelMessages.ts` 39
    - `remotePairingBinaryUpload.ts` 94
    - `remotePairingStats.ts` 34
    - total 401 ≤ 500
- **Validation**:
    - `bun run --cwd web typecheck` ✅
    - `bun run --cwd web test -t RemotePeerSession` ✅
    - `bun run --cwd web test -t RemotePairingController` ✅ (no matching tests; command exits clean)
    - `bun run --cwd web test` ✅
    - `bun run --cwd web build` ✅
    - old transport/timeout/restart grep empty ✅
- **Real-device RM**: RM1/RM2/RM3/RM5/RM6/RM8/RM10 deferred to phase K bulk run; no device access in this session.
- **Commit**: pending.

## Hotfix Follow-up — 2026-05-16T08:15:00Z

- `RemotePeerSession` now treats DataChannel readiness as heartbeat round-trip ACK, not `open`/peer ready.
- `getSnapshot()` maps transport-ready-but-channel-unacked to `connecting`; `untilReady()` waits for both layers.
- iOS background-stale heartbeat timeouts send a fresh probe after foreground instead of instantly restarting ICE.
- `RemotePairingController` stays `hydrating` until channel ACK, so remote queries cannot fire into a half-open channel.
- Validation: `bun run --cwd web typecheck`; focused `RemotePairingController|RemotePeerSession|handleRemotePeerChannelMessage|createRemotePeerApiClient|remotePairingViewModel`; `bun run --cwd web build` ✅
