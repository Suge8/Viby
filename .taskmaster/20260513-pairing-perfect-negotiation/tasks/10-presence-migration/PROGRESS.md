# Progress — 10-presence-migration

## Context Recovery Block

- **Current step**: complete
- **Status**: DONE
- **Spec**: ./SPEC.md
- **Plan**: ./TODO.csv
- **Claimed by**: agent
- **Lease until**: 2026-05-12T20:01:54Z
- **Next action**: Phase K legacy cleanup + final regression.

## Step 1 — 2026-05-12T20:00:00Z

- Read SPEC/TODO.
- Claimed row 10.
- Acceptance focus: desktop scan online state derives from bridge phase; hub keeps scan metadata but no scan active presence tracking.

## Step 2 — 2026-05-12T20:01:54Z

- Desktop connected count and DeviceCount popover now combine Hub device rows with `usePairingBridges().deviceLinks`.
- Removed scan-channel presence reporter path: `pairingPresenceSync`, `reportPairingPresence`, Hub route/sink/options.
- Hub `DevicePresenceTracker` ignores `pairing:*`; scan rows remain metadata only and never count active from Hub.
- Updated tests/docs for retired scan presence path.
- Validation: `bun run --cwd desktop typecheck` ✅; `bun run --cwd desktop test` ✅; `bun run --cwd hub typecheck` ✅; `bun run --cwd hub test` ✅.
- Real-device RM7/RM11 deferred to Phase K bulk run.
