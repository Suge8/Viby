# Progress — 02-perfect-negotiation

## Context Recovery Block

- **Current step**: #1 (Read SPEC + design impl)
- **Status**: TODO
- **Spec**: ./SPEC.md
- **Plan**: ./TODO.csv
- **Claimed by**: none
- **Lease until**: none
- **Next action**: 读 SPEC.md，形成实现模型，更新本文件再开始 step 2.

<!-- Append milestone entries on completion -->

## Phase B Complete — 2026-05-12T18:23:00Z

- **What changed**:
    - Added `shared/src/pairing/perfectNegotiation.ts` W3C perfect-negotiation engine in 80 lines.
    - Added hand-written RTCPeerConnection mock tests for initial offer/answer, polite/impolite glare, pre-SDP candidate, dispose.
    - Exported engine from `shared/src/pairing/index.ts`.
- **Validation**:
    - `bun run --cwd shared typecheck` ✅
    - `grep -E 'restartIce|iceconnectionstatechange|connectionstatechange' shared/src/pairing/perfectNegotiation.ts` empty ✅
    - `bun run --cwd shared test -t perfectNegotiation` ✅
- **Real-device RM**: not applicable for Phase B; no RM rows listed.
- **Commit**: pending.

## Hotfix Follow-up — 2026-05-16T08:15:00Z

- Added candidate buffering for `InvalidStateError` when ICE arrives before remote SDP; flush runs after `setRemoteDescription` succeeds.
- Kept Phase B boundary intact: no `restartIce`, no connection-state listeners, explicit `createOffer/createAnswer` + `setLocalDescription(desc)` remains.
- Validation: `bun run --cwd shared typecheck`; `bun run --cwd shared test -- perfectNegotiation` ✅
