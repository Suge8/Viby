import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    flushSessionWarmSnapshot,
    readSessionWarmSnapshot,
    removeSessionWarmSnapshot,
    writeSessionWarmSnapshot
} from '@/lib/sessionWarmSnapshot'

const SESSION_ID = 'session-1'
const SESSION_STORAGE_KEY = `viby:session-warm:${SESSION_ID}`

function createSession() {
    return {
        id: SESSION_ID,
        active: true,
        thinking: false,
        metadata: null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        activeAt: 1,
        thinkingAt: 1,
        model: null,
        modelReasoningEffort: null,
        permissionMode: 'default',
        collaborationMode: 'default',
        todos: undefined
    } as const
}

describe('sessionWarmSnapshot', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        window.localStorage.clear()
    })

    afterEach(() => {
        removeSessionWarmSnapshot(SESSION_ID)
        window.localStorage.clear()
        vi.useRealTimers()
    })

    it('reads the latest pending session snapshot before debounce persistence', () => {
        const session = createSession()

        writeSessionWarmSnapshot(session)

        expect(readSessionWarmSnapshot(SESSION_ID)).toEqual({ session })
        expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    })

    it('flushes pending session snapshots on pagehide', () => {
        writeSessionWarmSnapshot(createSession())

        window.dispatchEvent(new PageTransitionEvent('pagehide'))

        expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull()
    })

    it('flushes pending session snapshots when the document becomes hidden', () => {
        writeSessionWarmSnapshot(createSession())

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden'
        })
        document.dispatchEvent(new Event('visibilitychange'))

        expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull()
    })

    it('flushes pending session snapshots on freeze', () => {
        writeSessionWarmSnapshot(createSession())

        document.dispatchEvent(new Event('freeze'))

        expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull()
    })

    it('persists the session snapshot when flushed directly', () => {
        const session = createSession()
        writeSessionWarmSnapshot(session)

        flushSessionWarmSnapshot(SESSION_ID)

        expect(readSessionWarmSnapshot(SESSION_ID)).toEqual({ session })
    })
})
