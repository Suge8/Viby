import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    flushMessageWindowWarmSnapshot,
    readMessageWindowWarmSnapshot,
    removeMessageWindowWarmSnapshot,
    scheduleMessageWindowWarmSnapshot
} from '@/lib/messageWindowWarmSnapshot'

const SESSION_ID = 'session-1'
const STORAGE_KEY = `viby:message-window-warm:${SESSION_ID}`

function createSnapshot() {
    return {
        sessionId: SESSION_ID,
        messages: [] as never[],
        hasLoadedLatest: true,
        hasMore: false,
        historyExpanded: false,
        atBottom: true
    }
}

describe('messageWindowWarmSnapshot', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        window.localStorage.clear()
    })

    afterEach(() => {
        removeMessageWindowWarmSnapshot(SESSION_ID)
        window.localStorage.clear()
        vi.useRealTimers()
    })

    it('flushes pending message window snapshots on pagehide', () => {
        scheduleMessageWindowWarmSnapshot(createSnapshot())

        window.dispatchEvent(new PageTransitionEvent('pagehide'))

        expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    })

    it('flushes pending message window snapshots on freeze', () => {
        scheduleMessageWindowWarmSnapshot(createSnapshot())

        document.dispatchEvent(new Event('freeze'))

        expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    })

    it('persists and reads the flushed message window snapshot', () => {
        const snapshot = createSnapshot()
        scheduleMessageWindowWarmSnapshot(snapshot)

        flushMessageWindowWarmSnapshot(SESSION_ID)

        expect(readMessageWindowWarmSnapshot(SESSION_ID)).toEqual(snapshot)
    })
})
