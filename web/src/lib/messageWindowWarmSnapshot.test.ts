import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    flushMessageWindowWarmSnapshot,
    readMessageWindowWarmSnapshot,
    removeMessageWindowWarmSnapshot,
    scheduleMessageWindowWarmSnapshot,
} from '@/lib/messageWindowWarmSnapshot'
import { resetWarmSnapshotLifecycleForTests } from '@/lib/warmSnapshotLifecycle'

const SESSION_ID = 'session-1'

function createSnapshot() {
    return {
        sessionId: SESSION_ID,
        messages: [] as never[],
        hasLoadedLatest: true,
        hasMore: false,
        historyExpanded: false,
        atBottom: true,
    }
}

describe('messageWindowWarmSnapshot', () => {
    beforeEach(() => {})

    afterEach(async () => {
        removeMessageWindowWarmSnapshot(SESSION_ID)
        resetWarmSnapshotLifecycleForTests()
    })

    it('flushes pending message window snapshots on pagehide', () => {
        scheduleMessageWindowWarmSnapshot(createSnapshot())

        window.dispatchEvent(new PageTransitionEvent('pagehide'))

        expect(readMessageWindowWarmSnapshot(SESSION_ID)).toEqual(createSnapshot())
    })

    it('flushes pending message window snapshots on freeze', () => {
        scheduleMessageWindowWarmSnapshot(createSnapshot())

        document.dispatchEvent(new Event('freeze'))

        expect(readMessageWindowWarmSnapshot(SESSION_ID)).toEqual(createSnapshot())
    })

    it('persists and reads the flushed message window snapshot', () => {
        const snapshot = createSnapshot()
        scheduleMessageWindowWarmSnapshot(snapshot)

        flushMessageWindowWarmSnapshot(SESSION_ID)

        expect(readMessageWindowWarmSnapshot(SESSION_ID)).toEqual(snapshot)
    })
})
