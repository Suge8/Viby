import { describe, expect, it } from 'bun:test'
import type { SessionSummary } from './sessionSummary'
import { compareSessionSummaries, getSessionSummarySortTimestamp, toSessionSummary } from './sessionSummary'

function createSessionSummary(overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>): SessionSummary {
    const { id, ...restOverrides } = overrides

    return {
        id,
        active: false,
        thinking: false,
        activeAt: 0,
        updatedAt: 0,
        latestActivityAt: null,
        latestActivityKind: null,
        latestCompletedReplyAt: null,
        lifecycleState: 'closed',
        lifecycleStateSince: null,
        metadata: null,
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: false,
        resumeStrategy: 'none',
        model: null,
        modelReasoningEffort: null,
        ...restOverrides,
    }
}

describe('sessionSummary ordering', () => {
    it('keeps running sessions ordered by lifecycleStateSince instead of noisy updatedAt', () => {
        const olderRunningSession = createSessionSummary({
            id: 'running-older',
            active: true,
            updatedAt: 10_000,
            lifecycleState: 'running',
            lifecycleStateSince: 1_000,
        })
        const newerRunningSession = createSessionSummary({
            id: 'running-newer',
            active: true,
            updatedAt: 2_000,
            lifecycleState: 'running',
            lifecycleStateSince: 5_000,
        })

        expect(getSessionSummarySortTimestamp(olderRunningSession)).toBe(1_000)
        expect(
            [olderRunningSession, newerRunningSession].sort(compareSessionSummaries).map((session) => session.id)
        ).toEqual(['running-newer', 'running-older'])
    })

    it('keeps closed sessions ordered by updatedAt', () => {
        const olderClosedSession = createSessionSummary({
            id: 'closed-older',
            updatedAt: 1_000,
            lifecycleState: 'closed',
            lifecycleStateSince: 100,
        })
        const newerClosedSession = createSessionSummary({
            id: 'closed-newer',
            updatedAt: 5_000,
            lifecycleState: 'closed',
            lifecycleStateSince: 50,
        })

        expect(getSessionSummarySortTimestamp(newerClosedSession)).toBe(5_000)
        expect(
            [olderClosedSession, newerClosedSession].sort(compareSessionSummaries).map((session) => session.id)
        ).toEqual(['closed-newer', 'closed-older'])
    })

    it('keeps open sessions between running and history in the lifecycle rank order', () => {
        const runningSession = createSessionSummary({
            id: 'running',
            active: true,
            updatedAt: 3_000,
            lifecycleState: 'running',
            lifecycleStateSince: 3_000,
        })
        const openSession = createSessionSummary({
            id: 'open',
            updatedAt: 4_000,
            lifecycleState: 'open',
            lifecycleStateSince: 2_500,
        })
        const closedSession = createSessionSummary({
            id: 'closed',
            updatedAt: 5_000,
            lifecycleState: 'closed',
            lifecycleStateSince: 2_000,
        })

        expect(
            [closedSession, openSession, runningSession].sort(compareSessionSummaries).map((session) => session.id)
        ).toEqual(['running', 'open', 'closed'])
    })
})

describe('toSessionSummary', () => {
    it('projects the resolved driver and keeps runtime handles available to shared resume owners', () => {
        const summary = toSessionSummary({
            id: 'session-1',
            seq: 1,
            createdAt: 1,
            updatedAt: 10,
            active: true,
            activeAt: 10,
            metadata: {
                path: '/tmp/project',
                host: 'machine',
                driver: 'codex',
                runtimeHandles: {
                    codex: { sessionId: 'codex-session' },
                },
            },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 0,
            model: 'gpt-5',
            modelReasoningEffort: 'medium',
            permissionMode: 'default',
            collaborationMode: 'plan',
        } as never)

        expect(summary.metadata).toMatchObject({
            path: '/tmp/project',
            driver: 'codex',
            runtimeHandles: {
                codex: { sessionId: 'codex-session' },
            },
        })
        expect(summary.resumeAvailable).toBe(true)
        expect(summary.resumeStrategy).toBe('provider-handle')
    })

    it('keeps malformed terminal-only runtime handles non-resumable without inventing a fallback driver', () => {
        const summary = toSessionSummary({
            id: 'session-2',
            seq: 1,
            createdAt: 1,
            updatedAt: 10,
            active: false,
            activeAt: 10,
            metadata: {
                path: '/tmp/project',
                host: 'machine',
                driver: 'cursor',
                lifecycleState: 'archived',
                startedBy: 'terminal',
                runtimeHandles: {
                    cursor: { sessionId: 42 },
                },
            },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 0,
            model: null,
            modelReasoningEffort: null,
        } as never)

        expect(summary.metadata).toMatchObject({
            path: '/tmp/project',
            driver: 'cursor',
        })
        expect(summary.lifecycleState).toBe('archived')
        expect(summary.resumeAvailable).toBe(false)
    })

    it('projects runner-managed continuity sessions as resumable without provider runtime handles', () => {
        const summary = toSessionSummary({
            id: 'session-4',
            seq: 1,
            createdAt: 1,
            updatedAt: 10,
            active: false,
            activeAt: 10,
            metadata: {
                path: '/tmp/project',
                host: 'machine',
                driver: 'gemini',
                startedBy: 'runner',
                lifecycleState: 'closed',
            },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 0,
            model: 'gemini-2.5-pro',
            modelReasoningEffort: null,
        } as never)

        expect(summary.metadata).toMatchObject({
            path: '/tmp/project',
            driver: 'gemini',
        })
        expect(summary.resumeAvailable).toBe(true)
    })

    it('projects pi sessions as resumable when hub transcript replay can rebuild context', () => {
        const summary = toSessionSummary({
            id: 'session-3',
            seq: 1,
            createdAt: 1,
            updatedAt: 10,
            active: false,
            activeAt: 10,
            metadata: {
                path: '/tmp/project',
                host: 'machine',
                driver: 'pi',
                lifecycleState: 'closed',
            },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 0,
            model: 'openai/gpt-5.4-mini',
            modelReasoningEffort: 'high',
        } as never)

        expect(summary.metadata).toMatchObject({
            path: '/tmp/project',
            driver: 'pi',
        })
        expect(summary.resumeAvailable).toBe(true)
    })
})
