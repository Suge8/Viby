import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { queryKeys } from '@/lib/query-keys'
import { useResumableSessions } from './useResumableSessions'

function createWrapper(queryClient: QueryClient): (props: PropsWithChildren) => React.JSX.Element {
    return function Wrapper(props: PropsWithChildren): React.JSX.Element {
        return (
            <I18nProvider>
                <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
            </I18nProvider>
        )
    }
}

function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    })
}

function createSessionSummary(id: string) {
    return {
        id,
        active: false,
        thinking: false,
        activeAt: 10,
        updatedAt: 20,
        latestActivityAt: 20,
        latestActivityKind: 'ready',
        latestCompletedReplyAt: 20,
        lifecycleState: 'closed',
        lifecycleStateSince: 10,
        metadata: {
            path: `/tmp/${id}`,
            driver: 'codex',
            machineId: 'machine-1',
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: true,
        resumeStrategy: 'provider-handle',
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
    } as const
}

describe('useResumableSessions', () => {
    it('reuses the cached resumable page when the server replies notModified for the same revision', async () => {
        const queryClient = createQueryClient()
        const sessions = [createSessionSummary('session-1')]
        const getResumableSessions = vi
            .fn()
            .mockResolvedValueOnce({
                revision: 'rev-1',
                sessions,
                page: {
                    cursor: null,
                    nextCursor: null,
                    limit: 20,
                    hasMore: false,
                },
            })
            .mockResolvedValueOnce({
                revision: 'rev-1',
                notModified: true,
            })

        const { result } = renderHook(
            () =>
                useResumableSessions(
                    {
                        getResumableSessions,
                    } as never,
                    {
                        lifecycle: 'closed',
                    }
                ),
            {
                wrapper: createWrapper(queryClient),
            }
        )

        await waitFor(() => {
            expect(result.current.sessions).toEqual(sessions)
        })

        await act(async () => {
            await queryClient.invalidateQueries({
                queryKey: queryKeys.resumableSessions({
                    lifecycle: 'closed',
                }),
            })
        })

        await waitFor(() => {
            expect(getResumableSessions).toHaveBeenCalledTimes(2)
        })

        expect(getResumableSessions).toHaveBeenNthCalledWith(
            1,
            {
                cursor: null,
                lifecycle: 'closed',
            },
            undefined
        )
        expect(getResumableSessions).toHaveBeenNthCalledWith(
            2,
            {
                cursor: null,
                lifecycle: 'closed',
            },
            'rev-1'
        )
        expect(result.current.sessions).toEqual(sessions)
        expect(result.current.page).toEqual({
            cursor: null,
            nextCursor: null,
            limit: 20,
            hasMore: false,
        })
    })
})
