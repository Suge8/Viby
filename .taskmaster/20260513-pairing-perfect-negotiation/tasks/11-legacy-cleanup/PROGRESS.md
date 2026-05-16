# Progress — 11-legacy-cleanup

## Context Recovery Block

- **Current step**: #4 Manual / real-device regression
- **Status**: BLOCKED
- **Spec**: ./SPEC.md
- **Plan**: ./TODO.csv
- **Claimed by**: agent
- **Lease until**: 2026-05-12T22:30:00Z
- **Next action**: run RM1-RM12 on real iPhone Safari/PWA and record artifacts, then close Epic.

## Step 1 — 2026-05-12T20:15:00Z

- Removed legacy 9-signal schema exports from shared pairing schema and tests.
- Removed stale remote reconnect delay helper.
- Added `scripts/count-pairing-transport-lines.mjs` and `scripts/check-pairing-front-end-coverage.mjs`; both wired into `harness:check`.
- Rewrote `docs/architecture/pairing-broker.md`, updated presence/web/hub docs, added `docs/architecture/pairing-reconnection.md`.
- Deployed pairing broker to `1panel-main`; verified service active, local health, and public `/ready`.
- Validation passed: shared typecheck/test; pairing test; desktop typecheck/test; web typecheck/test/build; hub test; `harness:check`; `test:scripts`; line guard total 1473/1800.
- Blocker: RM1-RM12 real-device matrix cannot be executed from this API shell because no attached iPhone Safari/PWA/manual browser surface is available. Matrix records this explicitly.

## Step 2 — 2026-05-16T08:15:00Z

- Deployed reconnect/request-failure/PWA-icon hotfix bundle to `HK-4c8g:/opt/viby-pairing` preserving `pairing.env` and logs.
- Verified service active, local/public `/ready`, health script, served `assets/index-gxIHbcco.js`, manifest fallback start_url, icon byte match, and create/delete smoke.
- Validation rerun: web typecheck/focused tests/build; desktop typecheck/test; shared typecheck/focused tests; pairing typecheck/test; `harness:check`; `build:pairing`.
- Blocker unchanged: RM1-RM12 still require real iPhone Safari/PWA manual run before final close.
