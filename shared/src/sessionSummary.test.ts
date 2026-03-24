import { describe, expect, it } from 'bun:test'
import type { SessionSummary } from './sessionSummary'
import { compareSessionSummaries, getSessionSummarySortTimestamp } from './sessionSummary'

function createSessionSummary(
    overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>
): SessionSummary {
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
        model: null,
        modelReasoningEffort: null,
        ...restOverrides
    }
}

describe('sessionSummary ordering', () => {
    it('keeps running sessions ordered by lifecycleStateSince instead of noisy updatedAt', () => {
        const olderRunningSession = createSessionSummary({
            id: 'running-older',
            active: true,
            updatedAt: 10_000,
            lifecycleState: 'running',
            lifecycleStateSince: 1_000
        })
        const newerRunningSession = createSessionSummary({
            id: 'running-newer',
            active: true,
            updatedAt: 2_000,
            lifecycleState: 'running',
            lifecycleStateSince: 5_000
        })

        expect(getSessionSummarySortTimestamp(olderRunningSession)).toBe(1_000)
        expect([olderRunningSession, newerRunningSession].sort(compareSessionSummaries).map((session) => session.id)).toEqual([
            'running-newer',
            'running-older'
        ])
    })

    it('keeps closed sessions ordered by updatedAt', () => {
        const olderClosedSession = createSessionSummary({
            id: 'closed-older',
            updatedAt: 1_000,
            lifecycleState: 'closed',
            lifecycleStateSince: 100
        })
        const newerClosedSession = createSessionSummary({
            id: 'closed-newer',
            updatedAt: 5_000,
            lifecycleState: 'closed',
            lifecycleStateSince: 50
        })

        expect(getSessionSummarySortTimestamp(newerClosedSession)).toBe(5_000)
        expect([olderClosedSession, newerClosedSession].sort(compareSessionSummaries).map((session) => session.id)).toEqual([
            'closed-newer',
            'closed-older'
        ])
    })
})
