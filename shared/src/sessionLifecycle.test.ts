import { describe, expect, it } from 'bun:test'
import {
    isSessionArchivedLifecycleState,
    isSessionHistoryLifecycleState,
    isSessionInteractionDisabled,
    isSessionLifecycleState,
    isSessionResumable,
    isSessionRunningSectionLifecycleState,
    resolveInactiveSessionLifecycleState,
    resolveSessionInteractivity,
    resolveSessionLifecyclePatch,
} from './sessionLifecycle'

describe('sessionLifecycle section helpers', () => {
    it('normalizes inactive lifecycle state through a single helper', () => {
        expect(resolveInactiveSessionLifecycleState(undefined)).toBe('closed')
        expect(resolveInactiveSessionLifecycleState('open')).toBe('open')
        expect(resolveInactiveSessionLifecycleState('archived')).toBe('archived')
        expect(isSessionLifecycleState('open')).toBe(true)
        expect(isSessionLifecycleState('bogus')).toBe(false)
        expect(isSessionArchivedLifecycleState('archived')).toBe(true)
        expect(isSessionArchivedLifecycleState('open')).toBe(false)
    })

    it('keeps open sessions out of history while preserving the running section owner', () => {
        expect(isSessionRunningSectionLifecycleState('running')).toBe(true)
        expect(isSessionRunningSectionLifecycleState('open')).toBe(true)
        expect(isSessionHistoryLifecycleState('open')).toBe(false)
        expect(isSessionHistoryLifecycleState('closed')).toBe(true)
        expect(isSessionHistoryLifecycleState('archived')).toBe(true)
    })

    it('resolves lifecycle patch results through a single helper', () => {
        expect(
            resolveSessionLifecyclePatch({
                currentLifecycleState: 'running',
                currentLifecycleStateSince: 1_000,
                currentActive: true,
                currentActiveAt: 1_000,
                currentUpdatedAt: 2_000,
                patch: {
                    active: false,
                    updatedAt: 3_000,
                    lifecycleStateHint: 'open',
                    lifecycleStateSinceHint: 3_100,
                },
            })
        ).toEqual({
            lifecycleState: 'open',
            lifecycleStateSince: 3_100,
        })

        expect(
            resolveSessionLifecyclePatch({
                currentLifecycleState: 'open',
                currentLifecycleStateSince: 3_100,
                currentActive: false,
                currentActiveAt: 1_000,
                currentUpdatedAt: 3_000,
                patch: {
                    active: false,
                    updatedAt: 3_200,
                },
            })
        ).toEqual({
            lifecycleState: 'open',
            lifecycleStateSince: 3_100,
        })
    })
})

describe('sessionLifecycle interactivity', () => {
    it('keeps explicitly open inactive sessions interactive without demoting them to history', () => {
        const state = resolveSessionInteractivity({
            active: false,
            resumeAvailable: true,
            metadata: {
                driver: 'codex',
                lifecycleState: 'open',
            },
        } as never)

        expect(state).toMatchObject({
            lifecycleState: 'open',
            resumeAvailable: true,
            allowSendWhenInactive: true,
            retryAvailable: true,
        })
    })

    it('keeps closed sessions with a durable resume marker interactive', () => {
        const state = resolveSessionInteractivity({
            active: false,
            metadata: {
                driver: 'codex',
                lifecycleState: 'closed',
                runtimeHandles: {
                    codex: { sessionId: 'thread-1' },
                },
            },
        } as never)

        expect(state).toMatchObject({
            lifecycleState: 'closed',
            resumeAvailable: true,
            allowSendWhenInactive: true,
            retryAvailable: true,
        })
        expect(
            isSessionInteractionDisabled({
                active: false,
                allowSendWhenInactive: state.allowSendWhenInactive,
            })
        ).toBe(false)
        expect(
            isSessionResumable({
                active: false,
                metadata: {
                    driver: 'codex',
                    lifecycleState: 'closed',
                    runtimeHandles: {
                        codex: { sessionId: 'thread-1' },
                    },
                },
            } as never)
        ).toBe(true)
    })

    it('keeps archived sessions restorable through the same send gate when a resume marker exists', () => {
        const state = resolveSessionInteractivity({
            active: false,
            metadata: {
                driver: 'codex',
                lifecycleState: 'archived',
                runtimeHandles: {
                    codex: { sessionId: 'thread-1' },
                },
            },
        } as never)

        expect(state).toMatchObject({
            lifecycleState: 'archived',
            resumeAvailable: true,
            allowSendWhenInactive: true,
            retryAvailable: true,
        })
        expect(
            isSessionResumable({
                active: false,
                metadata: {
                    driver: 'codex',
                    lifecycleState: 'archived',
                    runtimeHandles: {
                        codex: { sessionId: 'thread-1' },
                    },
                },
            } as never)
        ).toBe(false)
    })

    it('keeps summary-seeded inactive sessions interactive when the list already knows a resume marker exists', () => {
        const state = resolveSessionInteractivity({
            active: false,
            resumeAvailable: true,
            metadata: {
                driver: 'codex',
                lifecycleState: 'closed',
            },
        } as never)

        expect(state).toMatchObject({
            lifecycleState: 'closed',
            resumeAvailable: true,
            allowSendWhenInactive: true,
            retryAvailable: true,
        })
        expect(
            isSessionInteractionDisabled({
                active: false,
                allowSendWhenInactive: state.allowSendWhenInactive,
            })
        ).toBe(false)
    })

    it('keeps terminal-only inactive sessions read-only when no continuity path exists', () => {
        const state = resolveSessionInteractivity({
            active: false,
            metadata: {
                driver: 'codex',
                lifecycleState: 'closed',
                startedBy: 'terminal',
            },
        } as never)

        expect(state).toMatchObject({
            lifecycleState: 'closed',
            resumeAvailable: false,
            allowSendWhenInactive: false,
            retryAvailable: false,
        })
        expect(
            isSessionInteractionDisabled({
                active: false,
                allowSendWhenInactive: state.allowSendWhenInactive,
            })
        ).toBe(true)
        expect(
            isSessionResumable({
                active: false,
                metadata: {
                    driver: 'codex',
                    lifecycleState: 'closed',
                    startedBy: 'terminal',
                },
            } as never)
        ).toBe(false)
    })

    it('keeps runner-managed inactive sessions interactive through transcript continuity even without provider handles', () => {
        const state = resolveSessionInteractivity({
            active: false,
            metadata: {
                driver: 'codex',
                lifecycleState: 'closed',
                startedBy: 'runner',
            },
        } as never)

        expect(state).toMatchObject({
            lifecycleState: 'closed',
            resumeAvailable: true,
            allowSendWhenInactive: true,
            retryAvailable: true,
        })
        expect(
            isSessionInteractionDisabled({
                active: false,
                allowSendWhenInactive: state.allowSendWhenInactive,
            })
        ).toBe(false)
    })

    it('treats inactive pi sessions as resumable through transcript replay even without runtime handles', () => {
        const state = resolveSessionInteractivity({
            active: false,
            metadata: {
                driver: 'pi',
                lifecycleState: 'closed',
            },
        } as never)

        expect(state).toMatchObject({
            lifecycleState: 'closed',
            resumeAvailable: true,
            allowSendWhenInactive: true,
            retryAvailable: true,
        })
        expect(
            isSessionResumable({
                active: false,
                metadata: {
                    driver: 'pi',
                    lifecycleState: 'closed',
                },
            } as never)
        ).toBe(true)
    })
})
