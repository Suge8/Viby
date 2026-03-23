import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import { useSession } from './useSession'

function createWrapper(queryClient: QueryClient): (props: PropsWithChildren) => React.JSX.Element {
    return function Wrapper(props: PropsWithChildren): React.JSX.Element {
        return (
            <QueryClientProvider client={queryClient}>
                {props.children}
            </QueryClientProvider>
        )
    }
}

function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            }
        }
    })
}

function createSessionSummary() {
    return {
        id: 'session-1',
        active: true,
        thinking: false,
        activeAt: 10,
        updatedAt: 20,
        latestActivityAt: 20,
        latestActivityKind: 'ready',
        latestCompletedReplyAt: 20,
        lifecycleState: 'running',
        lifecycleStateSince: 10,
        metadata: {
            path: '/Users/demo/Project/Viby',
            name: 'Seeded session',
            machineId: 'machine-1',
            flavor: 'codex',
            summary: {
                text: 'Session summary',
                updatedAt: 20
            }
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'yolo',
        collaborationMode: 'plan'
    } as const
}

describe('useSession', () => {
    it('seeds session detail from the sessions cache while the full query is pending', () => {
        const queryClient = createQueryClient()
        queryClient.setQueryData(queryKeys.sessions, {
            sessions: [createSessionSummary()]
        })

        const api = {
            getSession: vi.fn(() => new Promise(() => undefined))
        } as unknown as ApiClient

        const { result } = renderHook(() => useSession(api, 'session-1'), {
            wrapper: createWrapper(queryClient)
        })

        expect(result.current.session?.id).toBe('session-1')
        expect(result.current.session?.metadata?.path).toBe('/Users/demo/Project/Viby')
        expect(result.current.session?.metadata?.lifecycleState).toBe('running')
        expect(result.current.session?.permissionMode).toBe('yolo')
        expect(result.current.session?.collaborationMode).toBe('plan')
        expect(result.current.isPlaceholderData).toBe(true)
    })

    it('prefers an existing full session cache entry over a derived summary seed', () => {
        const queryClient = createQueryClient()
        queryClient.setQueryData(queryKeys.sessions, {
            sessions: [createSessionSummary()]
        })
        queryClient.setQueryData(queryKeys.session('session-1'), {
            session: {
                id: 'session-1',
                seq: 7,
                createdAt: 1,
                updatedAt: 30,
                active: true,
                activeAt: 10,
                metadata: {
                    path: '/Users/demo/Project/Viby',
                    host: 'demo.local',
                    flavor: 'codex'
                },
                metadataVersion: 4,
                agentState: {
                    controlledByUser: false
                },
                agentStateVersion: 5,
                thinking: false,
                thinkingAt: 30,
                model: 'gpt-5.4',
                modelReasoningEffort: null
            }
        })

        const api = {
            getSession: vi.fn(() => new Promise(() => undefined))
        } as unknown as ApiClient

        const { result } = renderHook(() => useSession(api, 'session-1'), {
            wrapper: createWrapper(queryClient)
        })

        expect(result.current.session?.seq).toBe(7)
        expect(result.current.session?.metadata?.host).toBe('demo.local')
        expect(result.current.isPlaceholderData).toBe(false)
    })

    it('keeps returning the summary seed when the detail query is idle but sessions cache is already warm', () => {
        const queryClient = createQueryClient()
        queryClient.setQueryData(queryKeys.sessions, {
            sessions: [createSessionSummary()]
        })

        const { result } = renderHook(() => useSession(null, 'session-1'), {
            wrapper: createWrapper(queryClient)
        })

        expect(result.current.session?.id).toBe('session-1')
        expect(result.current.session?.metadata?.path).toBe('/Users/demo/Project/Viby')
        expect(result.current.isLoading).toBe(false)
        expect(result.current.isPlaceholderData).toBe(true)
        expect(result.current.error).toBeNull()
    })
})
