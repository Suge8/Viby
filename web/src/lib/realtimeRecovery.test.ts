import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage, MessagesResponse, SessionRecoveryPage, SessionViewSnapshot } from '@/types/api'
import { clearMessageWindow, fetchLatestMessages, getMessageWindowState } from './message-window-store'
import { queryKeys } from './query-keys'
import { runRealtimeRecovery } from './realtimeRecovery'
import { reconcileSessionView } from './sessionViewReconciler'

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
                text: `message ${seq}`,
            },
        },
    }
}

function createRecoveryApi(
    totalMessages: number,
    messageCalls: Array<{ afterSeq: number | null; limit: number }>,
    recoveryCalls: Array<{ afterSeq: number; limit: number }> = [],
    viewCalls: string[] = []
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
                        hasMore: false,
                    },
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
                    hasMore: allMessages.length > messages.length,
                },
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
                    collaborationMode: 'default',
                },
                messages,
                page: {
                    afterSeq: options.afterSeq,
                    nextAfterSeq,
                    limit,
                    hasMore: remainingMessages.length > messages.length,
                },
            }
        },
        async getSessionView(sessionId: string): Promise<SessionViewSnapshot> {
            viewCalls.push(sessionId)
            const latestMessages = allMessages.slice(-50)
            const oldestSeq = latestMessages[0]?.seq ?? null
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
                    collaborationMode: 'default',
                    resumeAvailable: false,
                },
                latestWindow: {
                    messages: latestMessages,
                    page: {
                        limit: 50,
                        beforeSeq: null,
                        nextBeforeSeq: oldestSeq,
                        hasMore: allMessages.length > latestMessages.length,
                    },
                },
                stream: null,
                watermark: {
                    latestSeq: totalMessages,
                    updatedAt: totalMessages * 1_000,
                },
                interactivity: {
                    lifecycleState: 'running',
                    resumeAvailable: false,
                    allowSendWhenInactive: false,
                    retryAvailable: true,
                },
            }
        },
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

    it('refreshes list queries and reconciles the selected session via session view snapshot', async () => {
        const initialCalls: Array<{ afterSeq: number | null; limit: number }> = []
        const api = createRecoveryApi(120, initialCalls)
        await fetchLatestMessages(api, 'session-1')

        const stateBeforeRecovery = getMessageWindowState('session-1')
        expect(stateBeforeRecovery.newestSeq).toBe(120)

        const recoveryCalls: Array<{ afterSeq: number | null; limit: number }> = []
        const recoveryRequests: Array<{ afterSeq: number; limit: number }> = []
        const viewCalls: string[] = []
        const recoveryApi = createRecoveryApi(140, recoveryCalls, recoveryRequests, viewCalls)
        const queryClient = new QueryClient()
        const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await runRealtimeRecovery({
            queryClient,
            api: recoveryApi,
            selectedSessionId: 'session-1',
        })

        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sessions })
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.runtime })
        expect(viewCalls).toEqual(['session-1'])
        expect(recoveryRequests).toEqual([])
        expect(queryClient.getQueryData(queryKeys.session('session-1'))).toEqual(
            expect.objectContaining({
                detailHydrated: true,
                session: expect.objectContaining({
                    id: 'session-1',
                    seq: 140,
                }),
            })
        )

        const stateAfterRecovery = getMessageWindowState('session-1')
        expect(stateAfterRecovery.newestSeq).toBe(140)
    })

    it('hydrates the selected session from session view even when there is no local seq cursor yet', async () => {
        const calls: Array<{ afterSeq: number | null; limit: number }> = []
        const viewCalls: string[] = []
        const api = createRecoveryApi(30, calls, [], viewCalls)
        const queryClient = new QueryClient()

        await runRealtimeRecovery({
            queryClient,
            api,
            selectedSessionId: 'session-1',
        })

        expect(viewCalls).toEqual(['session-1'])
        expect(calls).toEqual([])
        expect(getMessageWindowState('session-1').newestSeq).toBe(30)
    })

    it('skips session message recovery when api or selected session is missing', async () => {
        const queryClient = new QueryClient()
        const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await runRealtimeRecovery({
            queryClient,
            api: null,
            selectedSessionId: null,
        })

        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sessions })
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.runtime })
        expect(invalidateQueriesSpy).toHaveBeenCalledTimes(2)
        expect(getMessageWindowState('session-1').newestSeq).toBeNull()
    })

    it('aborts a superseded selected-session reconcile before the stale request can overwrite the next session', async () => {
        const queryClient = new QueryClient()
        let firstSignal: AbortSignal | undefined
        let resolveFirst: VoidFunction = () => {}

        const api = {
            async getSessionView(sessionId: string, options?: { signal?: AbortSignal }): Promise<SessionViewSnapshot> {
                if (sessionId === 'session-1') {
                    firstSignal = options?.signal
                    await new Promise<void>((resolve) => {
                        resolveFirst = () => resolve()
                        options?.signal?.addEventListener('abort', () => resolve(), { once: true })
                    })
                }

                return {
                    session: {
                        id: sessionId,
                        seq: sessionId === 'session-1' ? 1 : 2,
                        createdAt: 1,
                        updatedAt: 2,
                        active: true,
                        activeAt: 2,
                        metadata: null,
                        metadataVersion: 0,
                        agentState: null,
                        agentStateVersion: 0,
                        thinking: false,
                        thinkingAt: 0,
                        model: null,
                        modelReasoningEffort: null,
                        permissionMode: 'default',
                        collaborationMode: 'default',
                        resumeAvailable: false,
                    },
                    latestWindow: {
                        messages: [],
                        page: {
                            limit: 50,
                            beforeSeq: null,
                            nextBeforeSeq: null,
                            hasMore: false,
                        },
                    },
                    stream: null,
                    watermark: {
                        latestSeq: sessionId === 'session-1' ? 1 : 2,
                        updatedAt: 2,
                    },
                    interactivity: {
                        lifecycleState: 'running',
                        resumeAvailable: false,
                        allowSendWhenInactive: false,
                        retryAvailable: true,
                    },
                }
            },
        } as ApiClient

        const firstReconcile = reconcileSessionView({
            queryClient,
            api,
            selectedSessionId: 'session-1',
        })

        await Promise.resolve()

        const secondReconcile = reconcileSessionView({
            queryClient,
            api,
            selectedSessionId: 'session-2',
        })

        resolveFirst()

        await Promise.all([firstReconcile, secondReconcile])

        expect(firstSignal?.aborted).toBe(true)
        expect(queryClient.getQueryData(queryKeys.session('session-2'))).toEqual(
            expect.objectContaining({
                detailHydrated: true,
                session: expect.objectContaining({
                    id: 'session-2',
                    seq: 2,
                }),
            })
        )
    })
})
