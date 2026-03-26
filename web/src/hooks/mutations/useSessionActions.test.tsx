// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { getMessageWindowState, ingestIncomingMessages } from '@/lib/message-window-store'
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
    queryClient.setQueryData(queryKeys.session(session.id), { session })
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
                resumeAvailable: false,
                model: session.model,
                modelReasoningEffort: session.modelReasoningEffort
            }
        ]
    })
}

describe('useSessionActions', () => {
    it('optimistically clears thinking for abort and then commits the authoritative snapshot without invalidating', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const activeThinkingSession: Session = {
            ...createSession('closed'),
            active: true,
            activeAt: 3_000,
            thinking: true,
            thinkingAt: 3_000,
            metadata: {
                ...createSession('closed').metadata!,
                lifecycleState: 'running',
                lifecycleStateSince: 3_000
            }
        }
        primeSessionsCache(queryClient, activeThinkingSession)

        let resolveAbort!: (session: Session) => void
        const abortedSession: Session = {
            ...activeThinkingSession,
            thinking: false,
            thinkingAt: 4_000
        }
        const api = {
            abortSession: vi.fn(() => new Promise<Session>((resolve) => {
                resolveAbort = resolve
            }))
        } as unknown as ApiClient

        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'codex'),
            { wrapper: createWrapper(queryClient) }
        )

        let abortPromise: Promise<void> | undefined
        await act(async () => {
            abortPromise = result.current.abortSession()
            await Promise.resolve()
        })

        await waitFor(() => {
            expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.thinking).toBe(false)
            expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.thinking).toBe(false)
        })

        await act(async () => {
            resolveAbort(abortedSession)
            await abortPromise
        })

        expect(api.abortSession).toHaveBeenCalledWith('session-1')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.thinkingAt).toBe(4_000)
        expect(invalidateQueries).not.toHaveBeenCalled()
    })

    it('writes the final archived snapshot into both detail and list caches immediately after archive succeeds', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
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
        expect(invalidateQueries).not.toHaveBeenCalled()
    })

    it('writes the resumed session snapshot directly into cache without invalidating', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        primeSessionsCache(queryClient, createSession('closed'))

        const resumedSession = {
            ...createSession('closed'),
            active: true,
            activeAt: 3_000,
            updatedAt: 3_000,
            metadata: {
                ...createSession('closed').metadata!,
                lifecycleState: 'running',
                lifecycleStateSince: 3_000
            }
        }
        const api = {
            resumeSession: vi.fn(async () => resumedSession)
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'codex'),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            const session = await result.current.resumeSession()
            expect(session).toEqual(resumedSession)
        })

        expect(api.resumeSession).toHaveBeenCalledWith('session-1')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.active).toBe(true)
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.active).toBe(true)
        expect(invalidateQueries).not.toHaveBeenCalled()
    })

    it('writes the switched remote session snapshot directly into cache without invalidating', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const localSession: Session = {
            ...createSession('closed'),
            active: true,
            activeAt: 3_000,
            metadata: {
                ...createSession('closed').metadata!,
                lifecycleState: 'running',
                lifecycleStateSince: 3_000
            },
            agentState: {
                controlledByUser: true,
                requests: {},
                completedRequests: {}
            }
        }
        primeSessionsCache(queryClient, localSession)

        const switchedSession: Session = {
            ...localSession,
            agentState: {
                controlledByUser: false,
                requests: {},
                completedRequests: {}
            },
            agentStateVersion: 2
        }
        const api = {
            switchSession: vi.fn(async () => switchedSession)
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'codex'),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.switchSession()
        })

        expect(api.switchSession).toHaveBeenCalledWith('session-1')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.agentState?.controlledByUser).toBe(false)
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.active).toBe(true)
        expect(invalidateQueries).not.toHaveBeenCalled()
    })

    it('applies live model and reasoning updates for remote Claude sessions', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const baseSession = {
            ...createSession('closed'),
            metadata: {
                ...createSession('closed').metadata!,
                flavor: 'claude' as const,
                lifecycleState: 'running' as const
            },
            active: true,
            model: 'sonnet',
            modelReasoningEffort: 'high' as const
        }
        primeSessionsCache(queryClient, baseSession)
        const api = {
            setModel: vi.fn(async () => ({
                ...baseSession,
                model: 'opus'
            })),
            setModelReasoningEffort: vi.fn(async () => ({
                ...baseSession,
                model: 'opus',
                modelReasoningEffort: 'max'
            }))
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'claude', {
                liveConfigSupport: {
                    isRemoteManaged: true,
                    canChangePermissionMode: true,
                    canChangeCollaborationMode: false,
                    canChangeModel: true,
                    canChangeModelReasoningEffort: true
                }
            }),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.setModel('opus')
            await result.current.setModelReasoningEffort('max')
        })

        expect(api.setModel).toHaveBeenCalledWith('session-1', 'opus')
        expect(api.setModelReasoningEffort).toHaveBeenCalledWith('session-1', 'max')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.model).toBe('opus')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.modelReasoningEffort).toBe('max')
        expect(invalidateQueries).not.toHaveBeenCalled()
    })

    it('applies live model updates for remote Gemini sessions', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const baseSession = {
            ...createSession('closed'),
            metadata: {
                ...createSession('closed').metadata!,
                flavor: 'gemini' as const,
                lifecycleState: 'running' as const
            },
            active: true,
            model: null,
            modelReasoningEffort: null
        }
        primeSessionsCache(queryClient, baseSession)
        const api = {
            setModel: vi.fn(async () => ({
                ...baseSession,
                model: 'gemini-2.5-flash-lite'
            }))
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'gemini', {
                liveConfigSupport: {
                    isRemoteManaged: true,
                    canChangePermissionMode: true,
                    canChangeCollaborationMode: false,
                    canChangeModel: true,
                    canChangeModelReasoningEffort: false
                }
            }),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.setModel('gemini-2.5-flash-lite')
        })

        expect(api.setModel).toHaveBeenCalledWith('session-1', 'gemini-2.5-flash-lite')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.model).toBe('gemini-2.5-flash-lite')
        expect(invalidateQueries).not.toHaveBeenCalled()
    })

    it('clears session client state through a single helper after delete succeeds', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const session = createSession('closed')
        primeSessionsCache(queryClient, session)
        ingestIncomingMessages(session.id, [{
            id: 'message-1',
            seq: 1,
            localId: null,
            createdAt: 1_000,
            content: {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'hello'
                }
            }
        }])

        const api = {
            deleteSession: vi.fn(async () => undefined)
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'codex'),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.deleteSession()
        })

        expect(api.deleteSession).toHaveBeenCalledWith('session-1')
        expect(queryClient.getQueryData(queryKeys.session('session-1'))).toBeUndefined()
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions).toEqual([])
        expect(getMessageWindowState('session-1').messages).toEqual([])
        expect(invalidateQueries).not.toHaveBeenCalled()
    })
})
