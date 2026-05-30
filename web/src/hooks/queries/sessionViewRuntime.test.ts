import { describe, expect, it, vi } from 'vitest'
import {
    applySessionStream,
    clearMessageWindow,
    getMessageWindowState,
    ingestIncomingMessages,
} from '@/lib/message-window-store'
import { disposeSessionViewRuntime } from './sessionViewRuntime'

function userMessage(seq: number) {
    return {
        id: `message-${seq}`,
        seq,
        localId: null,
        createdAt: seq,
        content: {
            role: 'user' as const,
            content: { type: 'text' as const, text: `message ${seq}` },
        },
    }
}

describe('sessionViewRuntime', () => {
    it('disposes transient session-view runtime without clearing durable messages', () => {
        clearMessageWindow('session-1')
        ingestIncomingMessages('session-1', [userMessage(1)])
        applySessionStream('session-1', {
            assistantTurnId: 'turn-1',
            startedAt: 1,
            updatedAt: 2,
            text: 'streaming',
        })
        const removeQueries = vi.fn()

        disposeSessionViewRuntime({ removeQueries }, 'session-1')

        const state = getMessageWindowState('session-1')
        expect(state.messages.map((message) => message.id)).toEqual(['message-1'])
        expect(state.stream).toBeNull()
        expect(removeQueries).toHaveBeenCalledOnce()
        clearMessageWindow('session-1')
    })
})
