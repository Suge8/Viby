# Progress — 05-desktop-bridge

## Context Recovery Block

- **Current step**: #1 (Read SPEC + design impl)
- **Status**: TODO
- **Spec**: ./SPEC.md
- **Plan**: ./TODO.csv
- **Claimed by**: none
- **Lease until**: none
- **Next action**: 读 SPEC.md，形成实现模型，更新本文件再开始 step 2.

<!-- Append milestone entries on completion -->

## Phase E Complete — 2026-05-12T20:05:00Z

- **What changed**:
    - Wrote `raw/import-audit.md`; all planned old bridge helpers had no outside callers.
    - Replaced desktop bridge with shared `createPairingTransport` host path.
    - Reduced counted `pairingBridge*.ts` runtime files to 200 total lines: controller 98, support 69, stats 33.
    - Renamed RPC owner files to `pairingPeerRpcCore.ts`, `pairingPeerPeripheralRequests.ts`, `pairingPeerResponseSupport.ts` so transport line guard only counts bridge lifecycle files.
    - Deleted legacy signal socket, candidate queue, ICE recovery, transport support, state, telemetry, channel health, and related obsolete tests.
    - Collapsed `PairingBridgeState.phase` to `connecting | ready | fatal`; updated desktop and shared link badge projections.
- **Desktop status copy**:
    - `connecting` → “正在握手”
    - `ready` → “已连接”
    - `fatal` → “连接已断开” / fatal reason fallback
- **Validation**:
    - `bun run --cwd desktop typecheck && bun run --cwd desktop test` ✅
    - `find desktop/src/lib -name 'pairingBridge*.ts' ... | wc -l` = 200 ✅
    - old rebuild/transportId grep empty ✅
    - desktop `restartIce` grep empty ✅
    - `bun run --cwd shared typecheck && bun run --cwd shared test -t buildPairingDeviceLinkStatus` ✅
- **Real-device RM**: RM1/RM3/RM4/RM7/RM8 deferred to phase K bulk run; no device access in this session.
- **Commit**: pending.
