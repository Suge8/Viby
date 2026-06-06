# Architecture Deepening Plan

> Scope: architecture plan only. Execution order: agent launch options → pairing host event stream → Web realtime recovery runtime → runtime turn owner.

## Success criteria

- Shallow modules become deep modules with smaller interfaces and higher localism.
- Existing product behavior stays intact unless explicitly listed below.
- Tests move to the new interfaces, not internal implementation details.
- Documentation stays aligned with `CONTEXT.md` terminology.

## 1. Deepen agent launch options

### Goal

Create a shared `agent launch options` module that turns AppCore launch facts into display-ready launch options and normalized temporary selection.

### Decisions

- Module location: `shared/src/agentLaunchOptions.ts`.
- Input: `AgentLaunchConfig`, agent, current temporary selection.
- Shared `AgentLaunchConfig` schema removes `defaultModel` / `defaultModelReasoningEffort`; AppCore encodes provider preference by ordering concrete options.
- Output:
  - `modelOptions`
  - `reasoningOptions`
  - `selection: { model, modelReasoningEffort }`
- Option shape: `{ value, label }`.
- Launch option semantics:
  - No `Use default` / `auto` / `default` option is shown.
  - Web does not keep curated model fallback lists.
  - Static shared model presets do not drive the launch-options main path.
  - AppCore launch config is the only accepted source for concrete model options.
  - New Session agent list only contains agents with concrete model options from AppCore.
  - Agents without real discovery or with launch-config errors are hidden for now; future discovery work is tracked in `future.md`.
  - AppCore model option order is contract: `availableModels[0]` is the recommended initial model.
  - AppCore reasoning option order is contract: `supportedThinkingLevels[0]` is the recommended initial reasoning for that model.
  - Duplicate model ids are normalized by keeping the first occurrence.
  - Duplicate reasoning levels inside one model are normalized by keeping the first occurrence.
  - If an agent has reasoning options, one concrete reasoning effort is always selected.
  - Agents with no reasoning options hide the reasoning field and submit no reasoning effort.
- Selection priority:
  - first available AppCore model option
  - first supported reasoning option for the selected model
- Migration choice: hard cut.
  - Clear old New Session preference version.
  - Do not preserve old `'auto'` / `'default'` preference meaning.
- New Session does not persist model / reasoning / codex service tier preferences.
  - User selection affects the session being created.
  - Next New Session reads AppCore/provider launch facts again.
- New Session preferences retain only `agent`, `sessionType`, and `yoloMode`.
- Shared owns computation only.

### Files

- `shared/src/agentLaunchConfig.ts` removes `defaultModel` / `defaultModelReasoningEffort`; option order is the initial-selection signal.
- `shared/src/agentLaunchOptions.ts` new module.
- Shared schema/function defines the New Session agent projection.
- Hub route `GET /runtime/agent-launch-options` aggregates AppCore availability + AppCore launch config and returns New Session agent projection: selectable `agents` plus `unavailable` reasons keyed by existing shared `AGENT_FLAVORS`.
- Route supports `?refresh=1` for explicit refresh.
- Route triggers detection when cache is empty; otherwise default reads cache.
- HTTP pending is the only detecting/loading signal; response does not include `refreshing`.
- Agent unavailable short-circuits to `agent_unavailable` and does not request launch config.
- Web renders selectable rows from `agents` and disabled rows from `unavailable`; no new candidate list is introduced.
- Web consumes Hub projection; Web does not orchestrate per-agent launch config requests.
- New Session stops using old Web hooks/routes for agent availability and per-agent launch config.
- Old Web-facing `/runtime/agent-availability` and `/runtime/agent-launch-config` routes are removed after `rg` confirms no remaining Web callers.
- Hub/AppCore lower-level RPC/cache for availability and launch config stay because runtime capability, driver switch, and pairing still need them.
- `web/src/components/NewSession/useAgentLaunchOptions.ts` consumes shared projection for the current temporary form selection.
- `web/src/components/NewSession/preferences.ts` clear/bump preference version and remove `agentSettings`.
- `web/src/lib/sessionConfigOptions.ts` remove Web-owned curated model fallback where obsolete.
- `shared/src/modeCatalog.ts` static model presets stop participating in launch-options main path.
- AppCore provider adapters that cannot expose concrete model options are excluded from New Session for now.
- Composer live model controls consume AppCore/session capability instead of Web model catalog.
- Tests in shared, Hub, and Web.

### Tests

- Shared tests:
  - no `auto` / `default` / `Use default` option.
  - concrete AppCore model options make an agent selectable in New Session.
  - missing concrete model options make an agent unavailable for New Session launch.
  - first model option is selected when current temporary model is absent.
  - valid current temporary model is preserved across launch-config refresh.
  - first supported reasoning option is selected when current temporary reasoning is absent.
  - valid current temporary reasoning is preserved across launch-config refresh.
  - duplicate model ids are deduped by first occurrence.
  - duplicate reasoning levels are deduped by first occurrence.
  - provider-first labels; fallback to model id when display name is absent.
  - no model/reasoning preference participates in selection.
- Hub tests:
  - aggregate route returns selectable New Session agents.
  - agent with availability but no concrete launch options appears in `unavailable` with `missing_model_options`.
  - agent with launch-config error appears in `unavailable` with `launch_config_error`.
  - unavailable agent appears in `unavailable` with `agent_unavailable` and does not request launch config.
  - cache-empty request triggers detection.
  - `?refresh=1` forces refresh.
- Web tests:
  - hook applies normalized temporary selection.
  - preference write stores only `agent`, `sessionType`, and `yoloMode`.
  - New Session picker renders returned `agents` as selectable.
  - New Session picker renders `unavailable` entries as disabled with reason text.
  - fallback picks first returned selectable agent.
  - composer live model controls do not use Web curated model fallback.

### Validation

- `bun run --cwd shared test`
- `bun run --cwd shared typecheck`
- `bun run --cwd hub test -- runtime`
- `bun run --cwd web test -- useAgentLaunchOptions`
- `bun run --cwd web typecheck`

## 2. Deepen pairing host event stream

### Goal

Move pairing host event stream semantics out of the HTTP route. The route becomes an SSE adapter.

### Decisions

- Module location: `pairing/src/hostEventStream.ts`.
- Interface: async iterator.
- Iterator yields:
  - `{ type: 'event', event }`
  - `{ type: 'keepalive' }`
- The module owns initial snapshot.
  - On subscribe, emit current host snapshot first.
  - Then emit eventBus increments in order.
- Cancellation uses `AbortSignal`.
- HTTP SSE route only handles auth, headers, serialization, and abort wiring.

### Files

- `pairing/src/hostEventStream.ts` new module.
- `pairing/src/httpSessionRoutes.ts` route becomes adapter.
- Existing event bus / host payload modules stay owners of their current facts.
- Tests in `pairing/src/hostEventStream.test.ts` plus small route tests.

### Tests

- `hostEventStream.test.ts`:
  - initial snapshot is first.
  - eventBus increments follow in order.
  - no event emits keepalive.
  - abort unsubscribes.
- Route tests:
  - auth still enforced.
  - SSE serialization still correct.

### Validation

- `bun run --cwd pairing test -- hostEventStream`
- `bun run --cwd pairing test -- http`
- `bun run --cwd pairing typecheck`

## 3. Deepen Web realtime recovery runtime

### Goal

Extract realtime recovery semantics from `AppRealtimeRuntime.tsx` into a pure runtime/controller. React only forwards browser signals and renders presentation.

### Decisions

- New module owns:
  - socket reconnect recovery.
  - foreground signal recovery.
  - page restored recovery.
  - catch-up in-flight dedupe.
  - failed state and retry trigger.
- Silent stale timer is removed; recovery is driven by concrete browser/socket/user signals.
- React forwards browser/socket/user signals; it does not own recovery sequencing or dedupe.
- Runtime state:
  - `idle`
  - `reconnecting`
  - `syncing`
  - `failed`
- UI hook maps runtime state to banner / notice presentation.
- Push prompt and install prompt stay outside this runtime.

### Files

- `web/src/lib/realtimeRecoveryRuntime.ts` new pure module.
- `web/src/components/AppRealtimeRuntime.tsx` reduced to wiring.
- `web/src/hooks/useRealtimeFeedback.ts` becomes presentation-only or consumes runtime state.
- Existing `web/src/lib/realtimeRecovery.ts` remains authoritative catch-up runner.

### Tests

- Runtime unit tests with fake clock and fake recovery runner:
  - socket reconnect triggers recovery.
  - foreground visible/resume dedupes recovery.
  - pageshow-restored triggers recovery.
  - no silent stale timer is scheduled.
  - in-flight recovery dedupes.
  - failure enters `failed`.
  - retry exits `failed` and reruns.
- React wiring tests only verify signal forwarding and state consumption.

### Validation

- `bun run --cwd web test -- realtimeRecoveryRuntime`
- `bun run --cwd web test -- AppRealtimeRuntime`
- `bun run --cwd web typecheck`
- `bun run --cwd web build`

## 4. Deepen runtime turn owner

### Goal

Make `runtime turn owner` the single owner of provider turn lifecycle. Codex must stop carrying a parallel loop / ready / pending owner.

### Decisions

- Codex uses `runRuntimeTurnOwner`.
- Extend owner with a small provider lifecycle interface:
  - `beforeTurn(batch)` returns `{ type: 'handled' }` for provider-owned commands or `{ type: 'continue', prepared }` for normal turns.
  - `waitUntilReadyForNextTurn()` waits for Codex in-flight / child-turn settle before the next ready.
  - `onTurnError(error)` surfaces user-visible terminal failure.
  - `afterTurn(reason)` runs provider cleanup for `success` / `error` / `abort`.
- No `readyDelayMs`; Codex readiness waits on real settle signals instead of a timer.
- Delete Codex-specific ready scheduler after migration.
- Provider keeps transport-specific behavior.
- Owner keeps queue wait, thinking, provider turn, failure, ready settle, cleanup order.

### Files

- `app-core/src/agent/runtimeTurnOwner.ts` deepen interface.
- `app-core/src/agent/runtimeTurnOwner.test.ts` expand first.
- `app-core/src/codex/codexRemoteCoordinator.ts` migrate loop.
- `app-core/src/codex/codexReadyScheduler.ts` delete after migration.
- `app-core/src/codex/codexRemoteTurnLifecycle.ts` shrink or fold into Codex transport helpers.
- Other provider launchers should keep existing behavior.

### Tests

- `runtimeTurnOwner.test.ts`:
  - `waitUntilReadyForNextTurn()` keeps new message pending and does not emit ready early.
  - `beforeTurn()` handled result skips normal turn.
  - no ready delay timer is scheduled.
  - terminal failure clears thinking, calls `onTurnError(error)`, then emits ready after settle.
  - `afterTurn(reason)` order for success / error / abort.
- Codex focused tests:
  - `/clear` and `/compact` still work.
  - child-turn events do not close parent turn early.
  - abort clears stream / permission / reasoning / diff.

### Validation

- `bun run --cwd app-core test -- runtimeTurnOwner`
- `bun run --cwd app-core test -- codex`
- `bun run --cwd app-core typecheck`

## Cross-cutting documentation

Already updated in `CONTEXT.md`:

- `agent launch options`
- `Web realtime recovery runtime`
- `pairing host event stream`

Update module docs when implementation lands:

- `docs/development/shared-contracts.md` for shared agent launch options.
- `docs/architecture/realtime-recovery.md` if Web recovery runtime changes recovery semantics.
- `docs/deployment/pairing-broker.md` only if host event stream externally observable behavior changes.
- `docs/development/app-core-runtime-boundaries.md` when Codex fully joins runtime turn owner.

## Final verification after all four land

- `bun run lint:fix`
- `bun run verify:commit`

If only partial work lands, run touched-scope validation listed above and state remaining risk.
