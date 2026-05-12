# Progress — 09-bridge-hub-decouple

## Context Recovery Block

- **Current step**: #5 complete
- **Status**: DONE
- **Spec**: ./SPEC.md
- **Plan**: ./TODO.csv
- **Claimed by**: agent
- **Lease until**: 2026-05-12T21:43:00Z
- **Next action**: commit Phase I, then start row 10 Phase J.

## Phase I Complete — 2026-05-12T19:58:00Z

- `usePairingBridges` lifecycle is now keyed only by `enabled + pairings`; `hubRuntimeKey` removed.
- Hook keeps latest Hub status in `statusRef`; existing bridge instances read it through `getStatus()`.
- `startPairingBridge` now uses a deferred `LocalHubPairingClient` proxy that rebinds on latest `localHubUrl|cliApiToken` per RPC without bridge teardown.
- Hub paused/unavailable now returns typed peer RPC error `{ code: 'hub_paused' }` instead of silently dropping or rebuilding transport.
- Hub-paused presence/event-stream errors no longer flip bridge to fatal; transport stays alive.
- Pairing add/remove still starts/removes only the affected bridge.

## Validation

- `bun run --cwd desktop typecheck` ✅
- `bun run --cwd desktop test -t usePairingBridges` ✅
- `bun run --cwd desktop test -t pairingBridgeController` ✅
- `bun run --cwd desktop test` ✅
- `rg "hubRuntimeKey" desktop/src` => 0 matches ✅
- RM7 real-device regression deferred to Phase K bulk run.
