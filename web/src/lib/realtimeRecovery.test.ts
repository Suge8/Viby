import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage, MessagesResponse, SessionRecoveryPage } from '@/types/api'
import {
    clearMessageWindow,
    fetchLatestMessages,
    getMessageWindowState
} from './message-window-store'
import { queryKeys } from './query-keys'
import { runRealtimeRecovery } from './realtimeRecovery'

function buildMessage(seq: number): DecryptedMessage {
    return {
        id: `message-${seq}`,
        seq,
        localId: null,
        createdAt: seq * 1_000,
        content: {
            role: seq % 2 === 0 ? 'assistant' : 'user',
            content: {
                type: 'text',
                text: `message ${seq}`
            }
        }
    }
}

function createRecoveryApi(
    totalMessages: number,
    messageCalls: Array<{ afterSeq: number | null; limit: number }>,
    recoveryCalls: Array<{ afterSeq: number; limit: number }> = []
): ApiClient {
    const allMessages = Array.from({ length: totalMessages }, (_, index) => buildMessage(index + 1))

    return {
        async getMessages(
            _sessionId: string,
            options: { beforeSeq?: number | null; afterSeq?: number | null; limit?: number }
        ): Promise<MessagesResponse> {
            const limit = options.limit ?? 50
            const afterSeq = options.afterSeq ?? null
            messageCalls.push({ afterSeq, limit })

            if (afterSeq !== null) {
                const messages = allMessages.filter((message) => (message.seq ?? 0) > afterSeq).slice(0, limit)
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

            const messages = allMessages.slice(-limit)
            const oldestSeq = messages[0]?.seq ?? null
            return {
                messages,
                page: {
                    limit,
                    beforeSeq: null,
                    nextBeforeSeq: oldestSeq,
                    hasMore: allMessages.length > messages.length
                }
            }
        },
        async getSessionRecovery(
            sessionId: string,
            options: { afterSeq: number; limit?: number }
        ): Promise<SessionRecoveryPage> {
            const limit = options.limit ?? 200
            recoveryCalls.push({ afterSeq: options.afterSeq, limit })

            const remainingMessages = allMessages.filter((message) => (message.seq ?? 0) > options.afterSeq)
            const messages = remainingMessages.slice(0, limit)
            const nextAfterSeq = messages.at(-1)?.seq ?? options.afterSeq

            return {
                session: {
                    id: sessionId,
                    seq: totalMessages,
                    createdAt: 1,
                    updatedAt: totalMessages * 1_000,
                    active: true,
                    activeAt: totalMessages * 1_000,
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
                    afterSeq: options.afterSeq,
                    nextAfterSeq,
                    limit,
                    hasMore: remainingMessages.length > messages.length
                }
            }
        }
    } as ApiClient
}

describe('runRealtimeRecovery', () => {
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
    })

    it('refreshes list queries and catches up selected session by newest seq', async () => {
        const initialCalls: Array<{ afterSeq: number | null; limit: number }> = []
        const api = createRecoveryApi(120, initialCalls)
        await fetchLatestMessages(api, 'session-1')

        const stateBeforeRecovery = getMessageWindowState('session-1')
        expect(stateBeforeRecovery.newestSeq).toBe(120)

        const recoveryCalls: Array<{ afterSeq: number | null; limit: number }> = []
        const recoveryRequests: Array<{ afterSeq: number; limit: number }> = []
        const recoveryApi = createRecoveryApi(140, recoveryCalls, recoveryRequests)
        const queryClient = new QueryClient()
        const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await runRealtimeRecovery({
            queryClient,
            api: recoveryApi,
            selectedSessionId: 'session-1'
        })

        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sessions })
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.machines })
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.session('session-1') })
        expect(recoveryRequests).toEqual([{ afterSeq: 120, limit: 200 }])
        expect(queryClient.getQueryData(queryKeys.session('session-1'))).toEqual({
            session: expect.objectContaining({
                id: 'session-1',
                seq: 140
            })
        })

        const stateAfterRecovery = getMessageWindowState('session-1')
        expect(stateAfterRecovery.newestSeq).toBe(140)
    })

    it('falls back to latest page fetch when the selected session has no seq cursor yet', async () => {
        const calls: Array<{ afterSeq: number | null; limit: number }> = []
        const api = createRecoveryApi(30, calls)
        const queryClient = new QueryClient()

        await runRealtimeRecovery({
            queryClient,
            api,
            selectedSessionId: 'session-1'
        })

        expect(calls).toEqual([{ afterSeq: null, limit: 50 }])
        expect(getMessageWindowState('session-1').newestSeq).toBe(30)
    })

    it('skips session message recovery when api or selected session is missing', async () => {
        const queryClient = new QueryClient()
        const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await runRealtimeRecovery({
            queryClient,
            api: null,
            selectedSessionId: null
        })

        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sessions })
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.machines })
        expect(invalidateQueriesSpy).toHaveBeenCalledTimes(2)
        expect(getMessageWindowState('session-1').newestSeq).toBeNull()
    })
})
