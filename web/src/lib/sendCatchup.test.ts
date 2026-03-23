import { describe, expect, it, vi } from 'vitest'
import type { DecryptedMessage } from '@/types/api'
import { runSendCatchup } from '@/lib/sendCatchup'

function createUserMessage(createdAt: number): DecryptedMessage {
    return {
        id: `user-${createdAt}`,
        seq: createdAt,
        localId: null,
        createdAt,
        content: {
            role: 'user',
            content: {
                type: 'text',
                text: 'hello'
            }
        }
    }
}

function createAgentMessage(createdAt: number): DecryptedMessage {
    return {
        id: `agent-${createdAt}`,
        seq: createdAt,
        localId: null,
        createdAt,
        content: {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'message',
                    message: 'hi'
                }
            }
        }
    }
}

describe('runSendCatchup', () => {
    it('stops once an agent reply appears after the sent message', async () => {
        const syncOnce = vi
            .fn<() => Promise<{ messages: DecryptedMessage[] }>>()
            .mockResolvedValueOnce({
                messages: [createUserMessage(100)]
            })
            .mockResolvedValueOnce({
                messages: [createUserMessage(100), createAgentMessage(101)]
            })
        const sleep = vi.fn(async () => {})

        await runSendCatchup({
            createdAt: 100,
            syncOnce,
            sleep,
            delayMs: 0
        })

        expect(syncOnce).toHaveBeenCalledTimes(2)
        expect(sleep).toHaveBeenCalledTimes(1)
    })

    it('reports the first detected agent reply', async () => {
        const reply = createAgentMessage(101)
        const onReplyDetected = vi.fn()
        const syncOnce = vi.fn(async () => ({
            messages: [createUserMessage(100), reply]
        }))

        await runSendCatchup({
            createdAt: 100,
            syncOnce,
            onReplyDetected
        })

        expect(onReplyDetected).toHaveBeenCalledWith({
            reply,
            attempt: 1
        })
    })

    it('respects the bounded retry count when no reply arrives', async () => {
        const syncOnce = vi.fn(async () => ({
            messages: [createUserMessage(100)]
        }))
        const sleep = vi.fn(async () => {})

        await runSendCatchup({
            createdAt: 100,
            syncOnce,
            sleep,
            delayMs: 0,
            maxAttempts: 3
        })

        expect(syncOnce).toHaveBeenCalledTimes(3)
        expect(sleep).toHaveBeenCalledTimes(2)
    })
})
