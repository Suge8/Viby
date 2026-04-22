import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { readSessionsWarmSnapshot, writeSessionsWarmSnapshot } from '@/lib/sessionsWarmSnapshot'
import { useSessions } from './useSessions'

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
        active: true,
        thinking: false,
        activeAt: 10,
        updatedAt: 20,
        latestActivityAt: 20,
        latestActivityKind: 'ready',
        latestCompletedReplyAt: 20,
        lifecycleState: 'running',
        lifecycleStateSince: 10,
        metadata: null,
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: true,
        resumeStrategy: 'provider-handle',
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
    } as const
}

describe('useSessions', () => {
    afterEach(() => {
        window.localStorage.clear()
    })

    it('hydrates from a warm sessions snapshot before the network list resolves', () => {
        writeSessionsWarmSnapshot([createSessionSummary('session-1')])
        const queryClient = createQueryClient()
        const api = {
            getSessions: vi.fn(() => new Promise(() => undefined)),
        }

        const { result } = renderHook(() => useSessions(api as never), {
            wrapper: createWrapper(queryClient),
        })

        expect(result.current.sessions).toEqual([createSessionSummary('session-1')])
        expect(result.current.hasWarmSnapshot).toBe(true)
        expect(result.current.isPlaceholderData).toBe(true)
        expect(result.current.isLoading).toBe(false)
    })

    it('writes the latest sessions list back to warm storage after a successful fetch', async () => {
        const queryClient = createQueryClient()
        const sessions = [createSessionSummary('session-1')]
        const api = {
            getSessions: vi.fn(async () => ({ sessions })),
        }

        const { result } = renderHook(() => useSessions(api as never), {
            wrapper: createWrapper(queryClient),
        })

        await waitFor(() => {
            expect(result.current.sessions).toEqual(sessions)
        })

        await waitFor(() => {
            expect(readSessionsWarmSnapshot()).toEqual({ sessions })
        })
    })
})
