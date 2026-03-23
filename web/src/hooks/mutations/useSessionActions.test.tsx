// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Session, SessionsResponse } from '@/types/api'
import { useSessionActions } from './useSessionActions'

function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false
            }
        }
    })
}

function createWrapper(queryClient: QueryClient): (props: PropsWithChildren) => React.JSX.Element {
    return function Wrapper(props: PropsWithChildren): React.JSX.Element {
        return (
            <QueryClientProvider client={queryClient}>
                {props.children}
            </QueryClientProvider>
        )
    }
}

function createSession(lifecycleState: 'closed' | 'archived'): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1_000,
        updatedAt: 2_000,
        active: false,
        activeAt: 1_500,
        metadata: {
            path: '/Users/demo/Project/Viby',
            host: 'demo.local',
            flavor: 'codex',
            lifecycleState,
            lifecycleStateSince: 2_000
        },
        metadataVersion: 1,
        agentState: {
            controlledByUser: false,
            requests: {},
            completedRequests: {}
        },
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 2_000,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'default',
        collaborationMode: 'default'
    }
}

function primeSessionsCache(queryClient: QueryClient, session: Session): void {
    queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
        sessions: [
            {
                id: session.id,
                active: session.active,
                thinking: session.thinking,
                activeAt: session.activeAt,
                updatedAt: session.updatedAt,
                latestActivityAt: session.updatedAt,
                latestActivityKind: 'ready',
                latestCompletedReplyAt: session.updatedAt,
                lifecycleState: session.metadata?.lifecycleState ?? 'closed',
                lifecycleStateSince: session.metadata?.lifecycleStateSince ?? null,
                metadata: {
                    path: session.metadata?.path ?? '',
                    flavor: session.metadata?.flavor ?? null
                },
                todoProgress: null,
                pendingRequestsCount: 0,
                model: session.model,
                modelReasoningEffort: session.modelReasoningEffort
            }
        ]
    })
}

describe('useSessionActions', () => {
    it('writes the final archived snapshot into both detail and list caches immediately after archive succeeds', async () => {
        const queryClient = createQueryClient()
        primeSessionsCache(queryClient, createSession('closed'))

        const archivedSession = createSession('archived')
        const api = {
            archiveSession: vi.fn(async () => archivedSession)
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'codex'),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.archiveSession()
        })

        expect(api.archiveSession).toHaveBeenCalledWith('session-1')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.metadata?.lifecycleState).toBe('archived')
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.lifecycleState).toBe('archived')
    })
})
