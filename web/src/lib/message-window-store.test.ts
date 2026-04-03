import type { ApiClient } from '@/api/client'
import type { DecryptedMessage, MessagesResponse, SessionRecoveryPage } from '@/types/api'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
    appendOptimisticMessage,
    applySessionStream,
    catchupMessagesAfter,
    clearMessageWindow,
    clearSessionStream,
    ensureLatestMessagesLoaded,
    fetchLatestMessages,
    fetchOlderMessages,
    fetchOlderMessagesUntilPreviousUser,
    flushMessageWindowSnapshot,
    getMessageWindowState,
    ingestIncomingMessages,
    markPendingReplyAccepted,
    removeMessageWindow,
    subscribeMessageWindow
} from './message-window-store'

function buildMessage(seq: number): DecryptedMessage {
    return buildRoleMessage(seq, seq % 2 === 0 ? 'assistant' : 'user')
}

function buildRoleMessage(seq: number, role: 'assistant' | 'user'): DecryptedMessage {
    return {
        id: `message-${seq}`,
        seq,
        localId: null,
        createdAt: seq * 1_000,
        content: {
            role,
            content: {
                type: 'text',
                text: `message ${seq}`
            }
        }
    }
}

function createRecoveryPage(sessionId: string, messages: DecryptedMessage[], afterSeq: number, limit: number): SessionRecoveryPage {
    return {
        session: {
            id: sessionId,
            seq: messages.at(-1)?.seq ?? afterSeq,
            createdAt: 1,
            updatedAt: (messages.at(-1)?.createdAt ?? afterSeq * 1_000),
            active: true,
            activeAt: messages.at(-1)?.createdAt ?? afterSeq * 1_000,
            metadata: null,
            metadataVersion: 0,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 0,
            model: null,
            modelReasoningEffort: null,
            permissionMode: 'default',
            collaborationMode: 'default'
        },
        messages,
        page: {
            afterSeq,
            nextAfterSeq: messages.at(-1)?.seq ?? afterSeq,
            limit,
            hasMore: false
        }
    }
}

function createMessagesApi(totalMessages: number): ApiClient {
    const allMessages = Array.from({ length: totalMessages }, (_, index) => buildMessage(index + 1))

    return {
        async getMessages(
            _sessionId: string,
            options: { beforeSeq?: number | null; afterSeq?: number | null; limit?: number }
        ): Promise<MessagesResponse> {
            const limit = options.limit ?? 50
            if (options.afterSeq !== undefined && options.afterSeq !== null) {
                const messages = allMessages.filter((message) => (message.seq ?? 0) > options.afterSeq!).slice(0, limit)
                return {
                    messages,
                    page: {
                        limit,
                        beforeSeq: null,
                        nextBeforeSeq: null,
                        hasMore: false
                    }
                }
            }

            const available = options.beforeSeq === undefined || options.beforeSeq === null
                ? allMessages
                : allMessages.filter((message) => (message.seq ?? 0) < options.beforeSeq!)
            const messages = available.slice(-limit)
            const oldestSeq = messages[0]?.seq ?? null

            return {
                messages,
                page: {
                    limit,
                    beforeSeq: options.beforeSeq ?? null,
                    nextBeforeSeq: oldestSeq,
                    hasMore: available.length > messages.length
                }
            }
        },
        async getSessionRecovery(
            sessionId: string,
            options: { afterSeq: number; limit?: number }
        ): Promise<SessionRecoveryPage> {
            const limit = options.limit ?? 200
            const messages = allMessages
                .filter((message) => (message.seq ?? 0) > options.afterSeq)
                .slice(0, limit)
            return createRecoveryPage(sessionId, messages, options.afterSeq, limit)
        }
    } as ApiClient
}

function createFixedMessagesApi(messages: DecryptedMessage[]): ApiClient {
    return {
        async getMessages(
            _sessionId: string,
            options: { beforeSeq?: number | null; afterSeq?: number | null; limit?: number }
        ): Promise<MessagesResponse> {
            const limit = options.limit ?? 50
            if (options.afterSeq !== undefined && options.afterSeq !== null) {
                const nextMessages = messages
                    .filter((message) => (message.seq ?? 0) > options.afterSeq!)
                    .slice(0, limit)

                return {
                    messages: nextMessages,
                    page: {
                        limit,
                        beforeSeq: null,
                        nextBeforeSeq: null,
                        hasMore: false
                    }
                }
            }

            const available = options.beforeSeq === undefined || options.beforeSeq === null
                ? messages
                : messages.filter((message) => (message.seq ?? 0) < options.beforeSeq!)
            const pageMessages = available.slice(-limit)
            const oldestSeq = pageMessages[0]?.seq ?? null

            return {
                messages: pageMessages,
                page: {
                    limit,
                    beforeSeq: options.beforeSeq ?? null,
                    nextBeforeSeq: oldestSeq,
                    hasMore: available.length > pageMessages.length
                }
            }
        },
        async getSessionRecovery(
            sessionId: string,
            options: { afterSeq: number; limit?: number }
        ): Promise<SessionRecoveryPage> {
            const limit = options.limit ?? 200
            const nextMessages = messages
                .filter((message) => (message.seq ?? 0) > options.afterSeq)
                .slice(0, limit)
            return createRecoveryPage(sessionId, nextMessages, options.afterSeq, limit)
        }
    } as ApiClient
}

describe('message-window-store', () => {
    beforeAll(() => {
        const requestAnimationFrameMock = (callback: FrameRequestCallback): number => {
            return setTimeout(() => callback(Date.now()), 0) as unknown as number
        }
        const cancelAnimationFrameMock = (handle: number): void => {
            clearTimeout(handle)
        }

        globalThis.requestAnimationFrame = requestAnimationFrameMock
        globalThis.cancelAnimationFrame = cancelAnimationFrameMock
    })

    afterEach(() => {
        clearMessageWindow('session-1')
        removeMessageWindow('session-1')
        window.localStorage.clear()
    })

    it('keeps expanded history mounted after loading older pages and receiving new messages', async () => {
        const api = createMessagesApi(500)

        expect(getMessageWindowState('session-1').hasLoadedLatest).toBe(false)
        await fetchLatestMessages(api, 'session-1')
        for (let page = 0; page < 9; page += 1) {
            await fetchOlderMessages(api, 'session-1')
        }

        let state = getMessageWindowState('session-1')
        expect(state.hasLoadedLatest).toBe(true)
        expect(state.messages).toHaveLength(500)
        expect(state.messages[0]?.seq).toBe(1)
        expect(state.messages.at(-1)?.seq).toBe(500)

        ingestIncomingMessages('session-1', [buildMessage(501)])

        state = getMessageWindowState('session-1')
        expect(state.messages).toHaveLength(501)
        expect(state.messages[0]?.seq).toBe(1)
        expect(state.messages.at(-1)?.seq).toBe(501)
    })

    it('batches older-page loading for previous-user jumps into a single visible commit', async () => {
        const api = createFixedMessagesApi([
            buildRoleMessage(1, 'user'),
            ...Array.from({ length: 104 }, (_, index) => buildRoleMessage(index + 2, 'assistant'))
        ])

        await fetchLatestMessages(api, 'session-1')

        const beforeBatch = getMessageWindowState('session-1')
        expect(beforeBatch.messages[0]?.seq).toBe(56)
        expect(beforeBatch.messagesVersion).toBe(1)

        await fetchOlderMessagesUntilPreviousUser(api, 'session-1')

        const afterBatch = getMessageWindowState('session-1')
        expect(afterBatch.messages[0]?.seq).toBe(1)
        expect(afterBatch.messages.at(-1)?.seq).toBe(105)
        expect(afterBatch.messagesVersion).toBe(2)
    })

    it('catches up unseen messages by afterSeq without reloading the full window', async () => {
        const api = createMessagesApi(120)

        await fetchLatestMessages(api, 'session-1')
        await catchupMessagesAfter(api, 'session-1', 50)

        const state = getMessageWindowState('session-1')
        expect(state.messages.at(-1)?.seq).toBe(120)
        expect(state.messages.some((message) => message.seq === 51)).toBe(true)
    })

    it('drops a transient stream once the matching durable codex message arrives', () => {
        applySessionStream('session-1', {
            streamId: 'stream-1',
            startedAt: 1,
            updatedAt: 2,
            text: 'Hello'
        })

        ingestIncomingMessages('session-1', [{
            id: 'message-1',
            seq: 1,
            localId: null,
            createdAt: 1_000,
            content: {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'message',
                        itemId: 'stream-1',
                        message: 'Hello'
                    }
                }
            }
        }])

        expect(getMessageWindowState('session-1').stream).toBeNull()
    })

    it('drops a transient stream once the matching durable Pi assistant message arrives', () => {
        applySessionStream('session-1', {
            streamId: 'pi-assistant-1000',
            startedAt: 1,
            updatedAt: 2,
            text: 'Hello from Pi'
        })

        ingestIncomingMessages('session-1', [{
            id: 'message-pi-1',
            seq: 1,
            localId: null,
            createdAt: 1_000,
            content: {
                role: 'agent',
                content: {
                    type: 'output',
                    data: {
                        type: 'assistant',
                        message: {
                            role: 'assistant',
                            api: 'pi',
                            provider: 'openai',
                            model: 'gpt-5.4-mini',
                            usage: {
                                input: 1,
                                output: 1,
                                cacheRead: 0,
                                cacheWrite: 0,
                                totalTokens: 2,
                                cost: {
                                    input: 0,
                                    output: 0,
                                    cacheRead: 0,
                                    cacheWrite: 0,
                                    total: 0
                                }
                            },
                            stopReason: 'stop',
                            timestamp: 1_000,
                            content: [
                                { type: 'text', text: 'Hello from Pi' }
                            ]
                        }
                    }
                }
            }
        }])

        expect(getMessageWindowState('session-1').stream).toBeNull()
    })

    it('ignores stale stream clears for a different stream id', () => {
        applySessionStream('session-1', {
            streamId: 'stream-1',
            startedAt: 1,
            updatedAt: 2,
            text: 'Hello'
        })

        clearSessionStream('session-1', 'stream-2')

        expect(getMessageWindowState('session-1').stream).toEqual({
            streamId: 'stream-1',
            startedAt: 1,
            updatedAt: 2,
            text: 'Hello'
        })
    })

    it('marks the initial latest page as loaded even when the session is empty', async () => {
        const api = createFixedMessagesApi([])

        await fetchLatestMessages(api, 'session-1')

        const state = getMessageWindowState('session-1')
        expect(state.hasLoadedLatest).toBe(true)
        expect(state.messages).toEqual([])
    })

    it('skips duplicate initial latest-page fetches once the window is hydrated', async () => {
        const api = {
            getMessages: async () => ({
                messages: [buildMessage(1)],
                page: {
                    limit: 50,
                    beforeSeq: null,
                    nextBeforeSeq: 1,
                    hasMore: false
                }
            })
        } as unknown as ApiClient
        const getMessagesSpy = vi.spyOn(api, 'getMessages')

        await ensureLatestMessagesLoaded(api, 'session-1')
        await ensureLatestMessagesLoaded(api, 'session-1')

        expect(getMessagesSpy).toHaveBeenCalledTimes(1)
        expect(getMessageWindowState('session-1').hasLoadedLatest).toBe(true)
    })

    it('moves the pending reply from sending to preparing and lets the stream owner clear it on the first delta', () => {
        appendOptimisticMessage('session-1', {
            id: 'local-1',
            seq: null,
            localId: 'local-1',
            createdAt: 1_000,
            status: 'sending',
            originalText: 'hello',
            content: {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'hello'
                }
            }
        })

        expect(getMessageWindowState('session-1').pendingReply).toEqual({
            localId: 'local-1',
            requestStartedAt: 1_000,
            serverAcceptedAt: null,
            phase: 'sending'
        })

        markPendingReplyAccepted('session-1', 'local-1', 1_250)

        expect(getMessageWindowState('session-1').pendingReply).toEqual({
            localId: 'local-1',
            requestStartedAt: 1_000,
            serverAcceptedAt: 1_250,
            phase: 'preparing'
        })

        applySessionStream('session-1', {
            streamId: 'stream-1',
            startedAt: 1_300,
            updatedAt: 1_300,
            text: 'H'
        })

        expect(getMessageWindowState('session-1').pendingReply).toBeNull()
    })

    it('keeps the in-memory message window alive across a short runtime teardown', async () => {
        vi.useFakeTimers()

        try {
            const api = createFixedMessagesApi([buildMessage(1)])
            await fetchLatestMessages(api, 'session-1')

            const unsubscribe = subscribeMessageWindow('session-1', () => undefined)
            unsubscribe()

            vi.advanceTimersByTime(59_000)

            const retained = getMessageWindowState('session-1')
            expect(retained.messages.at(-1)?.seq).toBe(1)
            expect(retained.restoredFromWarmSnapshot).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })

    it('restores the warm snapshot after transient runtime cleanup', async () => {
        vi.useFakeTimers()

        try {
            const api = createFixedMessagesApi([buildMessage(1)])

            await fetchLatestMessages(api, 'session-1')
            flushMessageWindowSnapshot('session-1')

            const unsubscribe = subscribeMessageWindow('session-1', () => undefined)
            unsubscribe()

            vi.advanceTimersByTime(60_000)

            const restored = getMessageWindowState('session-1')
            expect(restored.messages.at(-1)?.seq).toBe(1)
            expect(restored.hasLoadedLatest).toBe(true)
            expect(restored.restoredFromWarmSnapshot).toBe(true)
        } finally {
            vi.useRealTimers()
        }
    })

    it('refreshes a restored warm snapshot in the background without reopening the loading gate', async () => {
        vi.useFakeTimers()

        try {
            const initialApi = createFixedMessagesApi([buildMessage(1)])
            await fetchLatestMessages(initialApi, 'session-1')
            flushMessageWindowSnapshot('session-1')

            const unsubscribe = subscribeMessageWindow('session-1', () => undefined)
            unsubscribe()
            vi.advanceTimersByTime(60_000)

            let resolveRecovery!: (value: SessionRecoveryPage) => void
            const refreshApi = {
                getMessages: vi.fn(),
                getSessionRecovery: vi.fn(() => {
                    return new Promise<SessionRecoveryPage>((resolve) => {
                        resolveRecovery = resolve
                    })
                })
            } as unknown as ApiClient

            const refreshPromise = ensureLatestMessagesLoaded(refreshApi, 'session-1')
            expect(getMessageWindowState('session-1').isLoading).toBe(false)

            resolveRecovery(createRecoveryPage('session-1', [buildMessage(2)], 1, 200))
            await refreshPromise

            const refreshed = getMessageWindowState('session-1')
            expect(refreshApi.getMessages).not.toHaveBeenCalled()
            expect(refreshApi.getSessionRecovery).toHaveBeenCalledWith('session-1', {
                afterSeq: 1,
                limit: 200
            })
            expect(refreshed.messages.at(-1)?.seq).toBe(2)
            expect(refreshed.restoredFromWarmSnapshot).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })
})
