// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import {
    appendOptimisticMessage,
    applySessionStream,
    clearMessageWindow,
    getMessageWindowState,
    ingestIncomingMessages,
} from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'
import { TEST_PROJECT_PATH } from '@/test/sessionFactories'
import type { DecryptedMessage, Session, SessionsResponse } from '@/types/api'
import { useSessionActions } from './useSessionActions'

type CachedSession = Session & {
    resumeAvailable?: boolean
}

afterEach(() => {
    clearMessageWindow('session-1')
})

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

function createSession(lifecycleState: 'closed' | 'archived'): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1_000,
        updatedAt: 2_000,
        active: false,
        activeAt: 1_500,
        metadata: {
            path: TEST_PROJECT_PATH,
            host: 'demo.local',
            driver: 'codex',
            lifecycleState,
            lifecycleStateSince: 2_000,
        },
        metadataVersion: 1,
        agentState: {
            controlledByUser: false,
            requests: {},
            completedRequests: {},
        },
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 2_000,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'default',
        collaborationMode: 'default',
    }
}

function createOptimisticUserMessage(localId: string): DecryptedMessage {
    return {
        id: localId,
        seq: null,
        localId,
        createdAt: 3_000,
        status: 'sending',
        originalText: 'hello',
        content: {
            role: 'user',
            content: {
                type: 'text',
                text: 'hello',
            },
        },
    }
}

function primeSessionsCache(queryClient: QueryClient, session: CachedSession): void {
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
                    driver: session.metadata?.driver ?? null,
                },
                todoProgress: null,
                pendingRequestsCount: 0,
                resumeAvailable: session.resumeAvailable ?? false,
                resumeStrategy: 'none',
                model: session.model,
                modelReasoningEffort: session.modelReasoningEffort,
            },
        ],
    })
}

function expectOnlyCommandCapabilitiesInvalidated(
    invalidateQueries: ReturnType<typeof vi.spyOn>,
    sessionId: string
): void {
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.commandCapabilities(sessionId) })
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
                lifecycleStateSince: 3_000,
            },
        }
        primeSessionsCache(queryClient, activeThinkingSession)
        appendOptimisticMessage('session-1', createOptimisticUserMessage('local-1'))
        applySessionStream('session-1', {
            assistantTurnId: 'stream-1',
            startedAt: 3_100,
            updatedAt: 3_200,
            text: 'replying',
        })

        let resolveAbort!: (session: Session) => void
        const abortedSession: Session = {
            ...activeThinkingSession,
            thinking: false,
            thinkingAt: 4_000,
        }
        const api = {
            abortSession: vi.fn(
                () =>
                    new Promise<Session>((resolve) => {
                        resolveAbort = resolve
                    })
            ),
        } as unknown as ApiClient

        const { result } = renderHook(() => useSessionActions(api, activeThinkingSession), {
            wrapper: createWrapper(queryClient),
        })

        let abortPromise: Promise<void> | undefined
        await act(async () => {
            abortPromise = result.current.abortSession()
            await Promise.resolve()
        })

        await waitFor(() => {
            expect(
                queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.thinking
            ).toBe(false)
            expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.thinking).toBe(false)
            expect(getMessageWindowState('session-1').pendingReply).toBeNull()
            expect(getMessageWindowState('session-1').stream).toBeNull()
        })

        await act(async () => {
            resolveAbort(abortedSession)
            await abortPromise
        })

        expect(api.abortSession).toHaveBeenCalledWith('session-1')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.thinkingAt).toBe(
            4_000
        )
        expect(invalidateQueries).not.toHaveBeenCalled()
    })

    it('restores local stream state when abort fails', async () => {
        const queryClient = createQueryClient()
        const activeThinkingSession: Session = {
            ...createSession('closed'),
            active: true,
            activeAt: 3_000,
            thinking: true,
            thinkingAt: 3_000,
            metadata: {
                ...createSession('closed').metadata!,
                lifecycleState: 'running',
                lifecycleStateSince: 3_000,
            },
        }
        primeSessionsCache(queryClient, activeThinkingSession)
        appendOptimisticMessage('session-1', createOptimisticUserMessage('local-restore'))
        applySessionStream('session-1', {
            assistantTurnId: 'stream-restore',
            startedAt: 3_100,
            updatedAt: 3_200,
            text: 'replying',
        })

        const api = {
            abortSession: vi.fn(async () => {
                throw new Error('abort failed')
            }),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionActions(api, activeThinkingSession), {
            wrapper: createWrapper(queryClient),
        })

        await expect(result.current.abortSession()).rejects.toThrow('abort failed')
        expect(getMessageWindowState('session-1').pendingReply).toBeNull()
        expect(getMessageWindowState('session-1').stream).toMatchObject({
            assistantTurnId: 'stream-restore',
            text: 'replying',
        })
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.thinking).toBe(
            true
        )
    })

    it('restores local pending reply state when abort fails before any stream arrives', async () => {
        const queryClient = createQueryClient()
        const activeThinkingSession: Session = {
            ...createSession('closed'),
            active: true,
            activeAt: 3_000,
            thinking: true,
            thinkingAt: 3_000,
            metadata: {
                ...createSession('closed').metadata!,
                lifecycleState: 'running',
                lifecycleStateSince: 3_000,
            },
        }
        primeSessionsCache(queryClient, activeThinkingSession)
        appendOptimisticMessage('session-1', createOptimisticUserMessage('local-pending'))

        const api = {
            abortSession: vi.fn(async () => {
                throw new Error('abort failed')
            }),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionActions(api, activeThinkingSession), {
            wrapper: createWrapper(queryClient),
        })

        await expect(result.current.abortSession()).rejects.toThrow('abort failed')
        expect(getMessageWindowState('session-1').pendingReply).toMatchObject({
            localId: 'local-pending',
            phase: 'sending',
        })
        expect(getMessageWindowState('session-1').stream).toBeNull()
    })

    it('writes the final stopped snapshot into both detail and list caches immediately after stop succeeds', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const runningSession: CachedSession = {
            ...createSession('closed'),
            active: true,
            metadata: {
                ...createSession('closed').metadata!,
                lifecycleState: 'running',
                lifecycleStateSince: 3_000,
            },
        }
        primeSessionsCache(queryClient, runningSession)

        const closedSession = createSession('closed')
        const api = {
            closeSession: vi.fn(async () => closedSession),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionActions(api, runningSession), {
            wrapper: createWrapper(queryClient),
        })

        await act(async () => {
            await result.current.stopSession()
        })

        expect(api.closeSession).toHaveBeenCalledWith('session-1')
        expect(
            queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.metadata
                ?.lifecycleState
        ).toBe('closed')
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.lifecycleState).toBe(
            'closed'
        )
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
                lifecycleStateSince: 3_000,
            },
        }
        primeSessionsCache(queryClient, codexSession)

        const switchedSession: Session = {
            ...codexSession,
            metadata: {
                ...codexSession.metadata!,
                driver: 'claude',
            },
            metadataVersion: 2,
        }
        const api = {
            switchSessionDriver: vi.fn(async () => switchedSession),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionActions(api, codexSession), {
            wrapper: createWrapper(queryClient),
        })

        await act(async () => {
            await result.current.switchSessionDriver('claude')
        })

        expect(api.switchSessionDriver).toHaveBeenCalledWith('session-1', 'claude')
        expect(
            queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.metadata?.driver
        ).toBe('claude')
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.metadata?.driver).toBe(
            'claude'
        )
        expectOnlyCommandCapabilitiesInvalidated(invalidateQueries, 'session-1')
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
                lifecycleStateSince: 3_000,
            },
        }
        primeSessionsCache(queryClient, claudeSession)

        const switchedSession: Session = {
            ...claudeSession,
            metadata: {
                ...claudeSession.metadata!,
                driver: 'codex',
            },
            metadataVersion: 2,
        }
        const api = {
            switchSessionDriver: vi.fn(async () => switchedSession),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionActions(api, claudeSession), {
            wrapper: createWrapper(queryClient),
        })

        await act(async () => {
            await result.current.switchSessionDriver('codex')
        })

        expect(api.switchSessionDriver).toHaveBeenCalledWith('session-1', 'codex')
        expect(
            queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.metadata?.driver
        ).toBe('codex')
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.metadata?.driver).toBe(
            'codex'
        )
        expectOnlyCommandCapabilitiesInvalidated(invalidateQueries, 'session-1')
    })

    it('fails fast when the session target is missing', async () => {
        const queryClient = createQueryClient()
        const { result } = renderHook(() => useSessionActions(null, createSession('closed')), {
            wrapper: createWrapper(queryClient),
        })

        await expect(result.current.switchSessionDriver('claude')).rejects.toThrow('Session unavailable')
    })

    it('fails fast when the target driver is missing or unsupported', async () => {
        const queryClient = createQueryClient()
        const api = {
            switchSessionDriver: vi.fn(async () => createSession('closed')),
        } as Partial<ApiClient> as ApiClient
        const { result } = renderHook(() => useSessionActions(api, createSession('closed')), {
            wrapper: createWrapper(queryClient),
        })

        await expect(result.current.switchSessionDriver(null)).rejects.toThrow(
            'Same-session agent switching requires a supported target driver'
        )
        await expect(result.current.switchSessionDriver(undefined)).rejects.toThrow(
            'Same-session agent switching requires a supported target driver'
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
                collaborationMode: 'plan' as const,
            })),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () =>
                useSessionActions(api, session, {
                    liveConfigSupport: {
                        isRemoteManaged: true,
                        canChangePermissionMode: true,
                        canChangeCollaborationMode: true,
                        canChangeModel: true,
                        canChangeModelReasoningEffort: true,
                    },
                }),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.setCollaborationMode('plan')
        })

        expect(api.setCollaborationMode).toHaveBeenCalledWith('session-1', 'plan')
        expect(
            queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.collaborationMode
        ).toBe('plan')
    })

    it('rejects driver-switch failures without mutating local cache state', async () => {
        const queryClient = createQueryClient()
        const baseSession: Session = {
            ...createSession('closed'),
            active: true,
            metadata: {
                ...createSession('closed').metadata!,
                driver: 'codex',
            },
        }
        primeSessionsCache(queryClient, baseSession)
        const api = {
            switchSessionDriver: vi.fn(async () => {
                throw new Error('switch failed')
            }),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionActions(api, baseSession), {
            wrapper: createWrapper(queryClient),
        })

        await expect(result.current.switchSessionDriver('claude')).rejects.toThrow('switch failed')
        expect(
            queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.metadata?.driver
        ).toBe('codex')
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.metadata?.driver).toBe(
            'codex'
        )
    })

    it('applies live model and reasoning updates for Viby-managed Claude sessions', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const baseSession = {
            ...createSession('closed'),
            metadata: {
                ...createSession('closed').metadata!,
                driver: 'claude' as const,
                lifecycleState: 'running' as const,
            },
            active: true,
            model: 'sonnet',
            modelReasoningEffort: 'high' as const,
        }
        primeSessionsCache(queryClient, baseSession)
        const api = {
            setModel: vi.fn(async () => ({
                ...baseSession,
                model: 'opus',
            })),
            setModelReasoningEffort: vi.fn(async () => ({
                ...baseSession,
                model: 'opus',
                modelReasoningEffort: 'max',
            })),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () =>
                useSessionActions(api, baseSession, {
                    liveConfigSupport: {
                        isRemoteManaged: true,
                        canChangePermissionMode: true,
                        canChangeCollaborationMode: false,
                        canChangeModel: true,
                        canChangeModelReasoningEffort: true,
                    },
                }),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.setModel('opus')
            await result.current.setModelReasoningEffort('max')
        })

        expect(api.setModel).toHaveBeenCalledWith('session-1', 'opus')
        expect(api.setModelReasoningEffort).toHaveBeenCalledWith('session-1', 'max')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.model).toBe(
            'opus'
        )
        expect(
            queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.modelReasoningEffort
        ).toBe('max')
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
                lifecycleState: 'running' as const,
            },
            active: true,
            model: null,
            modelReasoningEffort: null,
        }
        primeSessionsCache(queryClient, baseSession)
        const api = {
            setModel: vi.fn(async () => ({
                ...baseSession,
                model: 'gemini-2.5-flash-lite',
            })),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () =>
                useSessionActions(api, baseSession, {
                    liveConfigSupport: {
                        isRemoteManaged: true,
                        canChangePermissionMode: true,
                        canChangeCollaborationMode: false,
                        canChangeModel: true,
                        canChangeModelReasoningEffort: false,
                    },
                }),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.setModel('gemini-2.5-flash-lite')
        })

        expect(api.setModel).toHaveBeenCalledWith('session-1', 'gemini-2.5-flash-lite')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.model).toBe(
            'gemini-2.5-flash-lite'
        )
        expect(invalidateQueries).not.toHaveBeenCalled()
    })

    it('clears session client state through a single helper after delete succeeds', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const session = createSession('closed')
        primeSessionsCache(queryClient, session)
        ingestIncomingMessages(session.id, [
            {
                id: 'message-1',
                seq: 1,
                localId: null,
                createdAt: 1_000,
                content: {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: 'hello',
                    },
                },
            },
        ])

        const api = {
            deleteSession: vi.fn(async () => undefined),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionActions(api, session), { wrapper: createWrapper(queryClient) })

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
