import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    flushSessionsWarmSnapshot,
    readSessionsWarmSnapshot,
    removeSessionsWarmSnapshot,
    writeSessionsWarmSnapshot,
} from '@/lib/sessionsWarmSnapshot'
import { resetWarmSnapshotLifecycleForTests } from '@/lib/warmSnapshotLifecycle'

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
        resumeStrategy: 'provider-handle',
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
    } as const
}

describe('sessionsWarmSnapshot', () => {
    afterEach(async () => {
        vi.useRealTimers()
        removeSessionsWarmSnapshot()
        resetWarmSnapshotLifecycleForTests()
    })

    it('reads pending sessions immediately before the debounce flush fires', () => {
        writeSessionsWarmSnapshot([createSessionSummary('session-1')])

        expect(readSessionsWarmSnapshot()).toEqual({
            sessions: [createSessionSummary('session-1')],
        })
    })

    it('persists and reads sessions after an explicit flush', () => {
        writeSessionsWarmSnapshot([createSessionSummary('session-1')])
        flushSessionsWarmSnapshot()

        expect(readSessionsWarmSnapshot()).toEqual({
            sessions: [createSessionSummary('session-1')],
        })
    })

    it('expires stale sessions snapshots', () => {
        const nowSpy = vi.spyOn(Date, 'now')
        nowSpy.mockReturnValue(1_000)
        writeSessionsWarmSnapshot([createSessionSummary('session-1')])
        flushSessionsWarmSnapshot()

        nowSpy.mockReturnValue(1_000 + 30 * 60 * 1_000 + 1)

        expect(readSessionsWarmSnapshot()).toBeUndefined()
        nowSpy.mockRestore()
    })
})
