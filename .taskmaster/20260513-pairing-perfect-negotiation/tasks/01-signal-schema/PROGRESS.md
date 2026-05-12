# Progress — 01-signal-schema

## Context Recovery Block

- **Current step**: #1 (Read SPEC + design impl)
- **Status**: TODO
- **Spec**: ./SPEC.md
- **Plan**: ./TODO.csv
- **Claimed by**: none
- **Lease until**: none
- **Next action**: 读 SPEC.md，形成实现模型，更新本文件再开始 step 2.

<!-- Append milestone entries on completion -->

## Phase A Complete — 2026-05-12T18:15:00Z

- **What changed**:
    - Added `shared/src/pairing/pairingSignal.ts` with V2 `description | candidate | bye` schemas.
    - Added focused `pairingSignalV2` tests for JSON round-trip, description variants, nullable candidate fields, and invalid bye reason rejection.
    - Exported V2 contract from `shared/src/pairing/index.ts`.
- **Validation**:
    - `bun run --cwd shared typecheck && bun run --cwd shared test -t pairingSignal` ✅
- **Real-device RM**: not applicable for Phase A; no RM rows listed.
- **Commit**: pending.
