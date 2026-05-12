# Progress — 08-timing-cleanup

## Context Recovery Block

- **Current step**: #5 complete
- **Status**: DONE
- **Spec**: ./SPEC.md
- **Plan**: ./TODO.csv
- **Claimed by**: agent
- **Lease until**: 2026-05-12T21:22:57Z
- **Next action**: commit Phase H, then start row 9 Phase I.

## Phase H Complete — 2026-05-12T19:42:16Z

- Removed banned timing constants: `PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS`, `PAIRING_BOOT_STUCK_RESCUE_MS`, `PAIRING_CONNECT_TIMEOUT_MS`.
- Added `PAIRING_REMOTE_RECONNECT_JITTER_RATIO` and `computePairingReconnectDelay()` permanent bounded exponential backoff.
- Updated shared `createPairingTransport()` reconnect loop to use shared jitter helper and keep attempt count in snapshots.
- Added reconnect notice action plumbing through notice center / persistent notice / floating viewport.
- Web retained-running state now subscribes to transport snapshots, shows attempt count after attempt > 2, and Stop closes bridge + clears retained ready + shows user-cancelled fatal state.
- Kept `RemotePairingController.tsx` under Phase G guard: 188 lines.

## Validation

- `bun run --cwd shared typecheck` ✅
- `bun run --cwd shared test -t pairingTiming` ✅
- `bun run --cwd shared test -t pairingTransport` ✅
- `bun run --cwd web typecheck` ✅
- `bun run --cwd web test` ✅
- `bun run --cwd web test -t 'RemotePairingController|remotePairingViewModel|RemotePairingScreens'` ✅
- `bun run --cwd web build` ✅
- Line guard: `RemotePairingController.tsx` 188; `pairingTransport.ts` 175.
- RM9 real-device regression deferred to Phase K bulk run.
