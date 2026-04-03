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
            driver: 'codex',
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
                    driver: session.metadata?.driver ?? null
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

    it('writes the switched Claude session snapshot directly into cache without invalidating', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const codexSession: Session = {
            ...createSession('closed'),
            active: true,
            activeAt: 3_000,
            metadata: {
                ...createSession('closed').metadata!,
                driver: 'codex',
                lifecycleState: 'running',
                lifecycleStateSince: 3_000
            }
        }
        primeSessionsCache(queryClient, codexSession)

        const switchedSession: Session = {
            ...codexSession,
            metadata: {
                ...codexSession.metadata!,
                driver: 'claude'
            },
            metadataVersion: 2
        }
        const api = {
            switchSessionDriver: vi.fn(async () => switchedSession)
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'codex'),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.switchSessionDriver('claude')
        })

        expect(api.switchSessionDriver).toHaveBeenCalledWith('session-1', 'claude')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.metadata?.driver).toBe('claude')
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.metadata?.driver).toBe('claude')
        expect(invalidateQueries).not.toHaveBeenCalled()
    })

    it('writes the switched Codex session snapshot directly into cache without invalidating', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const claudeSession: Session = {
            ...createSession('closed'),
            active: true,
            activeAt: 3_000,
            metadata: {
                ...createSession('closed').metadata!,
                driver: 'claude',
                lifecycleState: 'running',
                lifecycleStateSince: 3_000
            }
        }
        primeSessionsCache(queryClient, claudeSession)

        const switchedSession: Session = {
            ...claudeSession,
            metadata: {
                ...claudeSession.metadata!,
                driver: 'codex'
            },
            metadataVersion: 2
        }
        const api = {
            switchSessionDriver: vi.fn(async () => switchedSession)
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'claude'),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.switchSessionDriver('codex')
        })

        expect(api.switchSessionDriver).toHaveBeenCalledWith('session-1', 'codex')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.metadata?.driver).toBe('codex')
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.metadata?.driver).toBe('codex')
        expect(invalidateQueries).not.toHaveBeenCalled()
    })

    it('fails fast when the session target is missing', async () => {
        const queryClient = createQueryClient()
        const { result } = renderHook(
            () => useSessionActions(null, 'session-1', 'codex'),
            { wrapper: createWrapper(queryClient) }
        )

        await expect(result.current.switchSessionDriver('claude')).rejects.toThrow('Session unavailable')
    })

    it('fails fast when the target driver is missing or unsupported', async () => {
        const queryClient = createQueryClient()
        const api = {
            switchSessionDriver: vi.fn(async () => createSession('closed'))
        } as Partial<ApiClient> as ApiClient
        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'codex'),
            { wrapper: createWrapper(queryClient) }
        )

        await expect(result.current.switchSessionDriver(null)).rejects.toThrow(
            'Same-session agent switching requires an explicit Claude or Codex target driver'
        )
        await expect(result.current.switchSessionDriver('gemini')).rejects.toThrow(
            'Same-session agent switching requires an explicit Claude or Codex target driver'
        )
        expect(api.switchSessionDriver).not.toHaveBeenCalled()
    })

    it('applies collaboration changes using the authoritative driver', async () => {
        const queryClient = createQueryClient()
        const session = createSession('closed')
        primeSessionsCache(queryClient, session)
        const api = {
            setCollaborationMode: vi.fn(async () => ({
                ...session,
                collaborationMode: 'plan' as const
            }))
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'codex', {
                liveConfigSupport: {
                    isRemoteManaged: true,
                    canChangePermissionMode: true,
                    canChangeCollaborationMode: true,
                    canChangeModel: true,
                    canChangeModelReasoningEffort: true
                }
            }),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.setCollaborationMode('plan')
        })

        expect(api.setCollaborationMode).toHaveBeenCalledWith('session-1', 'plan')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.collaborationMode).toBe('plan')
    })

    it('rejects driver-switch failures without mutating local cache state', async () => {
        const queryClient = createQueryClient()
        const baseSession: Session = {
            ...createSession('closed'),
            active: true,
            metadata: {
                ...createSession('closed').metadata!,
                driver: 'codex'
            }
        }
        primeSessionsCache(queryClient, baseSession)
        const api = {
            switchSessionDriver: vi.fn(async () => {
                throw new Error('switch failed')
            })
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'codex'),
            { wrapper: createWrapper(queryClient) }
        )

        await expect(result.current.switchSessionDriver('claude')).rejects.toThrow('switch failed')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.metadata?.driver).toBe('codex')
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.metadata?.driver).toBe('codex')
    })

    it('applies live model and reasoning updates for Viby-managed Claude sessions', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const baseSession = {
            ...createSession('closed'),
            metadata: {
                ...createSession('closed').metadata!,
                driver: 'claude' as const,
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

    it('applies live model updates for Viby-managed Gemini sessions', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const baseSession = {
            ...createSession('closed'),
            metadata: {
                ...createSession('closed').metadata!,
                driver: 'gemini' as const,
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
