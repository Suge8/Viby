import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { I18nProvider } from '@/lib/i18n-context'
import { queryKeys } from '@/lib/query-keys'
import { writeSessionWarmSnapshot } from '@/lib/sessionWarmSnapshot'
import { TEST_PROJECT_PATH } from '@/test/sessionFactories'
import { useSession } from './useSession'

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
            path: TEST_PROJECT_PATH,
            name: 'Seeded session',
            machineId: 'machine-1',
            driver: 'codex',
            summary: {
                text: 'Session summary',
                updatedAt: 20,
            },
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: true,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'yolo',
        collaborationMode: 'plan',
    } as const
}

describe('useSession', () => {
    afterEach(() => {
        window.localStorage.clear()
    })

    it('seeds session detail from the sessions cache while the full query is pending', () => {
        const queryClient = createQueryClient()
        queryClient.setQueryData(queryKeys.sessions, {
            sessions: [createSessionSummary()],
        })

        const api = {
            getSessionView: vi.fn(() => new Promise(() => undefined)),
        } as unknown as ApiClient

        const { result } = renderHook(() => useSession(api, 'session-1'), {
            wrapper: createWrapper(queryClient),
        })

        expect(result.current.session?.id).toBe('session-1')
        expect(result.current.session?.metadata?.path).toBe(TEST_PROJECT_PATH)
        expect(result.current.session?.metadata?.lifecycleState).toBe('running')
        expect(result.current.session?.permissionMode).toBe('yolo')
        expect(result.current.session?.collaborationMode).toBe('plan')
        expect(result.current.isPlaceholderData).toBe(true)
        expect(result.current.isDetailHydrated).toBe(false)
    })

    it('prefers an existing full session cache entry over a derived summary seed', () => {
        const queryClient = createQueryClient()
        queryClient.setQueryData(queryKeys.sessions, {
            sessions: [createSessionSummary()],
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
                    path: TEST_PROJECT_PATH,
                    host: 'demo.local',
                    driver: 'codex',
                },
                metadataVersion: 4,
                agentState: {
                    controlOwner: 'viby',
                },
                agentStateVersion: 5,
                thinking: false,
                thinkingAt: 30,
                model: 'gpt-5.4',
                modelReasoningEffort: null,
            },
        })

        const api = {
            getSessionView: vi.fn(() => new Promise(() => undefined)),
        } as unknown as ApiClient

        const { result } = renderHook(() => useSession(api, 'session-1'), {
            wrapper: createWrapper(queryClient),
        })

        expect(result.current.session?.seq).toBe(7)
        expect(result.current.session?.metadata?.host).toBe('demo.local')
        expect(result.current.isPlaceholderData).toBe(false)
        expect(result.current.isDetailHydrated).toBe(false)
    })

    it('marks session detail as hydrated when the cached entry came from sessionView', () => {
        const queryClient = createQueryClient()
        queryClient.setQueryData(queryKeys.session('session-1'), {
            session: {
                id: 'session-1',
                seq: 7,
                createdAt: 1,
                updatedAt: 30,
                active: true,
                activeAt: 10,
                metadata: {
                    path: TEST_PROJECT_PATH,
                    host: 'demo.local',
                    driver: 'codex',
                },
                metadataVersion: 4,
                agentState: {
                    controlOwner: 'viby',
                },
                agentStateVersion: 5,
                thinking: false,
                thinkingAt: 30,
                model: 'gpt-5.4',
                modelReasoningEffort: null,
            },
            detailHydrated: true,
        })

        const api = {
            getSessionView: vi.fn(() => new Promise(() => undefined)),
        } as unknown as ApiClient

        const { result } = renderHook(() => useSession(api, 'session-1'), {
            wrapper: createWrapper(queryClient),
        })

        expect(result.current.isPlaceholderData).toBe(false)
        expect(result.current.isDetailHydrated).toBe(true)
    })

    it('keeps returning the summary seed when the detail query is idle but sessions cache is already warm', () => {
        const queryClient = createQueryClient()
        queryClient.setQueryData(queryKeys.sessions, {
            sessions: [createSessionSummary()],
        })

        const { result } = renderHook(() => useSession(null, 'session-1'), {
            wrapper: createWrapper(queryClient),
        })

        expect(result.current.session?.id).toBe('session-1')
        expect(result.current.session?.metadata?.path).toBe(TEST_PROJECT_PATH)
        expect(result.current.isLoading).toBe(false)
        expect(result.current.isPlaceholderData).toBe(true)
        expect(result.current.isDetailHydrated).toBe(false)
        expect(result.current.error).toBeNull()
    })

    it('hydrates from a warm session snapshot before the network detail query resolves', () => {
        const queryClient = createQueryClient()
        writeSessionWarmSnapshot({
            id: 'session-1',
            seq: 9,
            createdAt: 1,
            updatedAt: 30,
            active: false,
            activeAt: 10,
            metadata: {
                path: TEST_PROJECT_PATH,
                host: 'demo.local',
                driver: 'codex',
                lifecycleState: 'closed',
                lifecycleStateSince: 30,
            },
            metadataVersion: 4,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 30,
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            permissionMode: 'default',
            collaborationMode: 'default',
            todos: undefined,
        })

        const api = {
            getSessionView: vi.fn(() => new Promise(() => undefined)),
        } as unknown as ApiClient

        const { result } = renderHook(() => useSession(api, 'session-1'), {
            wrapper: createWrapper(queryClient),
        })

        expect(result.current.session?.seq).toBe(9)
        expect(result.current.hasWarmSnapshot).toBe(true)
        expect(result.current.isPlaceholderData).toBe(true)
        expect(result.current.isDetailHydrated).toBe(false)
    })

    it('hides transport-level detail behind the session fallback copy', async () => {
        const queryClient = createQueryClient()
        const api = {
            getSessionView: vi.fn(async () => {
                throw new Error('gRPC transport closed while loading session')
            }),
        } as unknown as ApiClient

        const { result } = renderHook(() => useSession(api, 'session-transport-error'), {
            wrapper: createWrapper(queryClient),
        })

        await waitFor(() => {
            expect(result.current.error).toBe('Could not load this session right now. Please try again.')
        })
    })
})
