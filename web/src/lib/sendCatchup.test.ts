import { describe, expect, it, vi } from 'vitest'
import { runSendCatchup, shouldRunPostSwitchCatchup } from '@/lib/sendCatchup'
import type { DecryptedMessage } from '@/types/api'

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
                text: 'hello',
            },
        },
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
                    message: 'hi',
                },
            },
        },
    }
}

function createDriverSwitchedMessage(createdAt: number, targetDriver: 'claude' | 'codex' = 'claude'): DecryptedMessage {
    return {
        id: `switched-${createdAt}`,
        seq: createdAt,
        localId: null,
        createdAt,
        content: {
            role: 'agent',
            content: {
                type: 'event',
                data: {
                    type: 'driver-switched',
                    targetDriver,
                },
            },
        },
    }
}

function createDriverSwitchFailureMessage(
    createdAt: number,
    overrides: Partial<{ code: string; stage: string }> = {}
): DecryptedMessage {
    return {
        id: `event-${createdAt}`,
        seq: createdAt,
        localId: null,
        createdAt,
        content: {
            role: 'agent',
            content: {
                type: 'event',
                data: {
                    type: 'driver-switch-send-failed',
                    ...overrides,
                },
            },
        },
    }
}

function createUnrelatedEventMessage(createdAt: number): DecryptedMessage {
    return {
        id: `other-event-${createdAt}`,
        seq: createdAt,
        localId: null,
        createdAt,
        content: {
            role: 'agent',
            content: {
                type: 'event',
                data: {
                    type: 'driver-switched',
                    targetDriver: 'claude',
                },
            },
        },
    }
}

describe('runSendCatchup', () => {
    it('only arms post-switch catch-up for the first user turn after a driver-switched marker', () => {
        expect(shouldRunPostSwitchCatchup([createDriverSwitchedMessage(90), createUserMessage(95)], 100)).toBe(false)

        expect(shouldRunPostSwitchCatchup([createUserMessage(80), createDriverSwitchedMessage(90)], 100)).toBe(true)

        expect(shouldRunPostSwitchCatchup([createUserMessage(80), createAgentMessage(90)], 100)).toBe(false)
    })

    it('stops once an agent reply appears after the sent message', async () => {
        const reply = createAgentMessage(101)
        let messages = [createUserMessage(100)]
        let listener: (() => void) | null = null
        const syncOnce = vi.fn(async () => {
            messages = [createUserMessage(100), reply]
            listener?.()
        })

        const outcome = await runSendCatchup({
            createdAt: 100,
            readSnapshot: () => ({ messages }),
            syncOnce,
            subscribe: (next) => {
                listener = next
                return () => {
                    listener = null
                }
            },
        })

        expect(outcome).toEqual({
            type: 'reply-detected',
            reply,
            attempt: 2,
        })
        expect(syncOnce).toHaveBeenCalledTimes(1)
    })

    it('reports the first detected agent reply', async () => {
        const reply = createAgentMessage(101)
        const onReplyDetected = vi.fn()
        const syncOnce = vi.fn(async () => undefined)

        const outcome = await runSendCatchup({
            createdAt: 100,
            readSnapshot: () => ({
                messages: [createUserMessage(100), reply],
            }),
            syncOnce,
            onReplyDetected,
        })

        expect(outcome).toEqual({
            type: 'reply-detected',
            reply,
            attempt: 1,
        })
        expect(onReplyDetected).toHaveBeenCalledWith({
            reply,
            attempt: 1,
        })
    })

    it('returns the typed driver-switch failure event when one appears after acceptance', async () => {
        const syncOnce = vi.fn(async () => undefined)

        const outcome = await runSendCatchup({
            createdAt: 100,
            readSnapshot: () => ({
                messages: [
                    createUserMessage(100),
                    createDriverSwitchFailureMessage(101, {
                        code: 'empty_first_turn',
                        stage: 'callback_flush',
                    }),
                ],
            }),
            syncOnce,
        })

        expect(outcome).toEqual({
            type: 'driver-switch-send-failed',
            event: {
                type: 'driver-switch-send-failed',
                code: 'empty_first_turn',
                stage: 'callback_flush',
            },
            attempt: 1,
        })
    })

    it('falls back to the generic failure shape when the failure payload is malformed', async () => {
        const syncOnce = vi.fn(async () => undefined)

        const outcome = await runSendCatchup({
            createdAt: 100,
            readSnapshot: () => ({
                messages: [
                    createUserMessage(100),
                    createDriverSwitchFailureMessage(101, {
                        code: 'bad-code',
                        stage: 'bad-stage',
                    }),
                ],
            }),
            syncOnce,
        })

        expect(outcome).toEqual({
            type: 'driver-switch-send-failed',
            event: {
                type: 'driver-switch-send-failed',
                code: undefined,
                stage: undefined,
            },
            attempt: 1,
        })
    })

    it('ignores unrelated events and returns silently when the bounded wait expires', async () => {
        const syncOnce = vi.fn(async () => undefined)

        const outcome = await runSendCatchup({
            createdAt: 100,
            readSnapshot: () => ({
                messages: [createUserMessage(100), createUnrelatedEventMessage(101)],
            }),
            syncOnce,
            timeoutMs: 0,
        })

        expect(outcome).toEqual({
            type: 'no-evidence',
            attemptCount: 2,
        })
        expect(syncOnce).toHaveBeenCalledTimes(1)
    })
})
