// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ApiClient, ApiError } from '@/api/client'
import { clearMessageWindow, getMessageWindowState } from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'
import type { SessionsResponse } from '@/types/api'
import { useSendMessage } from './useSendMessage'

const harness = vi.hoisted(() => ({
    notification: vi.fn(),
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            notification: harness.notification,
        },
    }),
}))

function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    })
}

function createWrapper(queryClient: QueryClient): (props: PropsWithChildren) => React.JSX.Element {
    return function Wrapper(props: PropsWithChildren): React.JSX.Element {
        return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
    }
}

function seedSessionsSummary(queryClient: QueryClient): void {
    queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
        sessions: [
            {
                id: 'session-1',
                active: true,
                thinking: false,
                activeAt: 1_000,
                updatedAt: 2_000,
                latestActivityAt: 2_000,
                latestActivityKind: 'ready',
                latestCompletedReplyAt: 2_000,
                lifecycleState: 'running',
                lifecycleStateSince: 1_000,
                metadata: {
                    path: '/tmp/project',
                    driver: 'codex',
                },
                todoProgress: null,
                pendingRequestsCount: 0,
                resumeAvailable: false,
                resumeStrategy: 'none',
                model: 'gpt-5.4',
                modelReasoningEffort: null,
                permissionMode: 'default',
                collaborationMode: 'default',
            },
        ],
    })
}

function createDeferred(): {
    promise: Promise<void>
    resolve: () => void
    reject: (error: Error) => void
} {
    let resolvePromise!: () => void
    let rejectPromise!: (error: Error) => void
    const promise = new Promise<void>((resolve, reject) => {
        resolvePromise = resolve
        rejectPromise = reject
    })

    return {
        promise,
        resolve: resolvePromise,
        reject: rejectPromise,
    }
}

describe('useSendMessage', () => {
    beforeEach(() => {
        harness.notification.mockReset()
        clearMessageWindow('session-1')
    })

    afterEach(() => {
        clearMessageWindow('session-1')
        vi.restoreAllMocks()
    })

    it('appends the optimistic first message immediately while the Hub-owned send request is still pending', async () => {
        const queryClient = createQueryClient()
        seedSessionsSummary(queryClient)
        const deferred = createDeferred()
        const api = {
            sendMessage: vi.fn(async () => {
                await deferred.promise
                return {
                    id: 'session-1',
                    active: true,
                    metadata: {
                        driver: 'codex',
                        codexSessionId: 'thread-1',
                    },
                } as never
            }),
        } as unknown as ApiClient

        const { result } = renderHook(() => useSendMessage(api, 'session-1'), { wrapper: createWrapper(queryClient) })

        act(() => {
            result.current.sendMessage('hello after resume')
        })

        const optimistic = getMessageWindowState('session-1').messages
        expect(optimistic).toHaveLength(1)
        expect(optimistic[0]).toMatchObject({
            localId: expect.any(String),
            status: 'sending',
            content: {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'hello after resume',
                },
            },
        })
        expect(getMessageWindowState('session-1').pendingReply).toMatchObject({
            localId: optimistic[0]?.localId,
            phase: 'sending',
            serverAcceptedAt: null,
        })
        await waitFor(() => {
            expect(api.sendMessage).toHaveBeenCalledTimes(1)
        })

        await act(async () => {
            deferred.resolve()
            await deferred.promise
        })

        await waitFor(() => {
            expect(api.sendMessage).toHaveBeenCalledTimes(1)
        })

        expect(getMessageWindowState('session-1').messages[0]?.status).toBe('sent')
        expect(getMessageWindowState('session-1').pendingReply).toMatchObject({
            localId: optimistic[0]?.localId,
            phase: 'preparing',
            serverAcceptedAt: expect.any(Number),
        })
    })

    it('marks the optimistic message failed when the Hub-owned send request fails', async () => {
        const queryClient = createQueryClient()
        seedSessionsSummary(queryClient)
        const api = {
            sendMessage: vi.fn(async () => {
                throw new Error('send failed')
            }),
        } as unknown as ApiClient

        const { result } = renderHook(() => useSendMessage(api, 'session-1'), { wrapper: createWrapper(queryClient) })

        act(() => {
            result.current.sendMessage('will fail to resume')
        })

        const localId = getMessageWindowState('session-1').messages[0]?.localId
        expect(localId).toEqual(expect.any(String))

        await waitFor(() => {
            expect(getMessageWindowState('session-1').messages[0]?.status).toBe('failed')
        })

        expect(api.sendMessage).toHaveBeenCalledTimes(1)
        expect(getMessageWindowState('session-1').pendingReply).toBeNull()
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]).toMatchObject({
            latestActivityKind: 'ready',
            latestActivityAt: 2_000,
            updatedAt: 2_000,
        })
    })

    it('refreshes authoritative session snapshots instead of rolling back lifecycle state after server-side send failures', async () => {
        const queryClient = createQueryClient()
        seedSessionsSummary(queryClient)
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const onSendError = vi.fn()
        const api = {
            sendMessage: vi.fn(async () => {
                throw new ApiError('HTTP 409 Conflict: No machine online', 409, 'no_machine_online')
            }),
        } as unknown as ApiClient

        const { result } = renderHook(() => useSendMessage(api, 'session-1', { onSendError }), {
            wrapper: createWrapper(queryClient),
        })

        act(() => {
            result.current.sendMessage('hello after archive')
        })

        await waitFor(() => {
            expect(getMessageWindowState('session-1').messages[0]?.status).toBe('failed')
        })

        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.session('session-1') })
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.sessions })
        expect(onSendError).toHaveBeenCalledWith(
            expect.objectContaining({
                sessionId: 'session-1',
                error: expect.objectContaining({ code: 'no_machine_online' }),
            })
        )
    })

    it('rebuilds pending reply state and preserves attachments when retrying a failed send', async () => {
        const queryClient = createQueryClient()
        seedSessionsSummary(queryClient)
        const attachment = {
            id: 'att-1',
            filename: 'image.png',
            mimeType: 'image/png',
            size: 123,
            path: '/tmp/image.png',
        }
        const api = {
            sendMessage: vi
                .fn()
                .mockRejectedValueOnce(new Error('send failed'))
                .mockResolvedValueOnce({
                    id: 'session-1',
                    active: true,
                    metadata: {
                        driver: 'codex',
                        codexSessionId: 'thread-1',
                    },
                } as never),
        } as unknown as ApiClient

        const { result } = renderHook(() => useSendMessage(api, 'session-1'), { wrapper: createWrapper(queryClient) })

        act(() => {
            result.current.sendMessage('retry with attachment', [attachment])
        })

        await waitFor(() => {
            expect(getMessageWindowState('session-1').messages[0]?.status).toBe('failed')
        })

        const localId = getMessageWindowState('session-1').messages[0]?.localId
        expect(localId).toEqual(expect.any(String))

        act(() => {
            result.current.retryMessage(localId!)
        })

        expect(getMessageWindowState('session-1').messages[0]?.status).toBe('sending')
        expect(getMessageWindowState('session-1').pendingReply).toMatchObject({
            localId,
            phase: 'sending',
        })

        await waitFor(() => {
            expect(api.sendMessage).toHaveBeenCalledTimes(2)
        })

        expect(api.sendMessage).toHaveBeenLastCalledWith('session-1', 'retry with attachment', localId, [attachment])
    })
})
