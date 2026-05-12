# Progress — 07-ui-state-machine

## Context Recovery Block

- **Current step**: #1 (Read SPEC + design impl)
- **Status**: TODO
- **Spec**: ./SPEC.md
- **Plan**: ./TODO.csv
- **Claimed by**: none
- **Lease until**: none
- **Next action**: 读 SPEC.md，形成实现模型，更新本文件再开始 step 2.

<!-- Append milestone entries on completion -->

## Phase G Complete — 2026-05-13T05:20:00Z

- **What changed**:
    - Collapsed `RemotePairingController` to `hydrating | first-pairing | running | fatal`; controller is 179 lines.
    - Added `RemotePairingPersistence.ts` on app cache DB store `pairingRetainedReady`; app cache DB version bumped to 3.
    - Added `RemotePairingHydrateSkeleton.tsx` (13 lines) for refresh hydrate; running path keeps workspace shell mounted.
    - Shrank `RemoteConnectingPhase` to `pairing | verify | finalizing`; removed legacy reconnect loop.
    - Cleaned remote pairing error/i18n keys to compact reconnect + explicit fatal set.
- **Validation**:
    - `bun run --cwd web typecheck` ✅
    - `bun run --cwd web test -t RemotePairingPersistence` ✅
    - `bun run --cwd web test -t RemotePairingController` ✅
    - `bun run --cwd web test` ✅
    - `bun run --cwd web build` ✅
    - grep legacy error/phase keys empty ✅
- **Real-device RM**: RM5 deferred to Phase K bulk run; no iPhone Safari device in this session.
- **Commit**: pending.
