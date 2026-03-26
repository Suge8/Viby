import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    flushSessionsWarmSnapshot,
    readSessionsWarmSnapshot,
    removeSessionsWarmSnapshot,
    writeSessionsWarmSnapshot
} from '@/lib/sessionsWarmSnapshot'

function createSessionSummary(id: string) {
    return {
        id,
        active: true,
        thinking: false,
        activeAt: 10,
        updatedAt: 20,
        latestActivityAt: 20,
        latestActivityKind: 'ready',
        latestCompletedReplyAt: 20,
        lifecycleState: 'running',
        lifecycleStateSince: 10,
        metadata: null,
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: true,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high'
    } as const
}

describe('sessionsWarmSnapshot', () => {
    afterEach(() => {
        removeSessionsWarmSnapshot()
        window.localStorage.clear()
        vi.useRealTimers()
    })

    it('reads pending sessions immediately before the debounce flush fires', () => {
        writeSessionsWarmSnapshot([createSessionSummary('session-1')])

        expect(readSessionsWarmSnapshot()).toEqual({
            sessions: [createSessionSummary('session-1')]
        })
    })

    it('persists and reads sessions after an explicit flush', () => {
        writeSessionsWarmSnapshot([createSessionSummary('session-1')])
        flushSessionsWarmSnapshot()

        expect(readSessionsWarmSnapshot()).toEqual({
            sessions: [createSessionSummary('session-1')]
        })
    })

    it('expires stale sessions snapshots', () => {
        vi.useFakeTimers()
        writeSessionsWarmSnapshot([createSessionSummary('session-1')])
        flushSessionsWarmSnapshot()

        vi.advanceTimersByTime(30 * 60 * 1_000 + 1)

        expect(readSessionsWarmSnapshot()).toBeUndefined()
    })
})
