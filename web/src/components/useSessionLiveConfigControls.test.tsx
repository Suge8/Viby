// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { useSessionLiveConfigControls } from './useSessionLiveConfigControls'

const platformHarness = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn()
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            notification: (type: 'success' | 'error') => {
                if (type === 'success') {
                    platformHarness.success()
                    return
                }

                platformHarness.error()
            }
        }
    })
}))

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

function createSession(overrides?: Partial<Session>): Session {
    return {
        id: 'session-1',
        active: true,
        thinking: false,
        permissionMode: 'default',
        collaborationMode: 'default',
        model: 'gpt-5.4-mini',
        modelReasoningEffort: null,
        metadata: {
            flavor: 'codex'
        },
        agentState: {
            controlledByUser: false
        },
        ...overrides
    } as Session
}

function primeSessionCaches(queryClient: QueryClient, session: Session): void {
    queryClient.setQueryData(queryKeys.session(session.id), {
        session
    })
    queryClient.setQueryData(queryKeys.sessions, {
        sessions: [{
            id: session.id,
            active: session.active,
            thinking: session.thinking,
            activeAt: session.active ? 1 : null,
            updatedAt: 1,
            latestActivityAt: 1,
            latestActivityKind: 'ready',
            latestCompletedReplyAt: 1,
            lifecycleState: session.metadata?.lifecycleState ?? 'running',
            lifecycleStateSince: session.metadata?.lifecycleStateSince ?? null,
            metadata: {
                path: session.metadata?.path ?? '',
                flavor: session.metadata?.flavor ?? null
            },
            todoProgress: null,
            pendingRequestsCount: 0,
            resumeAvailable: false,
            permissionMode: session.permissionMode,
            collaborationMode: session.collaborationMode,
            model: session.model,
            modelReasoningEffort: session.modelReasoningEffort
        }]
    })
}

describe('useSessionLiveConfigControls', () => {
    beforeEach(() => {
        platformHarness.success.mockReset()
        platformHarness.error.mockReset()
    })

    it('writes the updated live config snapshot directly into both caches', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const session = createSession()
        primeSessionCaches(queryClient, session)
        const api = {
            setPermissionMode: vi.fn(async () => ({
                ...session,
                permissionMode: 'read-only' as const
            }))
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionLiveConfigControls({
            api,
            session,
            liveConfigSupport: {
                isRemoteManaged: true,
                canChangePermissionMode: true,
                canChangeCollaborationMode: true,
                canChangeModel: true,
                canChangeModelReasoningEffort: true
            },
            onSwitchToRemote: vi.fn(async () => undefined),
            attachmentsSupported: true,
            allowSendWhenInactive: false,
            isResumingSession: false
        }), {
            wrapper: createWrapper(queryClient)
        })

        await act(async () => {
            await result.current.composerHandlers.onPermissionModeChange?.('read-only')
        })

        expect(api.setPermissionMode).toHaveBeenCalledWith('session-1', 'read-only')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.permissionMode).toBe('read-only')
        expect(queryClient.getQueryData<{ sessions: Array<{ permissionMode: string }> }>(queryKeys.sessions)?.sessions[0]?.permissionMode).toBe('read-only')
        expect(invalidateQueries).not.toHaveBeenCalled()
        expect(platformHarness.success).toHaveBeenCalledOnce()
        expect(platformHarness.error).not.toHaveBeenCalled()
    })

    it('hides permission controls when the session cannot change permission mode', () => {
        const queryClient = createQueryClient()
        const session = createSession()
        const api = {
            setPermissionMode: vi.fn(async () => session)
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionLiveConfigControls({
            api,
            session,
            liveConfigSupport: {
                isRemoteManaged: false,
                canChangePermissionMode: false,
                canChangeCollaborationMode: false,
                canChangeModel: false,
                canChangeModelReasoningEffort: false
            },
            onSwitchToRemote: vi.fn(async () => undefined),
            attachmentsSupported: true,
            allowSendWhenInactive: false,
            isResumingSession: false
        }), {
            wrapper: createWrapper(queryClient)
        })

        expect(result.current.composerHandlers.onPermissionModeChange).toBeUndefined()
        expect(api.setPermissionMode).not.toHaveBeenCalled()
        expect(platformHarness.success).not.toHaveBeenCalled()
        expect(platformHarness.error).not.toHaveBeenCalled()
    })

    it('rejects invalid permission modes for the current flavor without mutating cache', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const session = createSession()
        const api = {
            setPermissionMode: vi.fn(async () => session)
        } as Partial<ApiClient> as ApiClient

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const { result } = renderHook(() => useSessionLiveConfigControls({
            api,
            session: createSession(),
            liveConfigSupport: {
                isRemoteManaged: true,
                canChangePermissionMode: true,
                canChangeCollaborationMode: true,
                canChangeModel: true,
                canChangeModelReasoningEffort: true
            },
            onSwitchToRemote: vi.fn(async () => undefined),
            attachmentsSupported: true,
            allowSendWhenInactive: false,
            isResumingSession: false
        }), {
            wrapper: createWrapper(queryClient)
        })

        await act(async () => {
            await result.current.composerHandlers.onPermissionModeChange?.('plan')
        })

        expect(api.setPermissionMode).not.toHaveBeenCalled()
        expect(invalidateQueries).not.toHaveBeenCalled()
        expect(platformHarness.success).not.toHaveBeenCalled()
        expect(platformHarness.error).toHaveBeenCalledOnce()

        errorSpy.mockRestore()
    })

    it('exposes live Claude model and reasoning handlers when the session supports them', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'claude'
            },
            model: 'sonnet',
            modelReasoningEffort: 'high'
        })
        primeSessionCaches(queryClient, session)
        const api = {
            setModel: vi.fn(async () => ({
                ...session,
                model: 'opus'
            })),
            setModelReasoningEffort: vi.fn(async () => ({
                ...session,
                model: 'opus',
                modelReasoningEffort: 'max'
            }))
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionLiveConfigControls({
            api,
            session,
            liveConfigSupport: {
                isRemoteManaged: true,
                canChangePermissionMode: true,
                canChangeCollaborationMode: false,
                canChangeModel: true,
                canChangeModelReasoningEffort: true
            },
            onSwitchToRemote: vi.fn(async () => undefined),
            attachmentsSupported: true,
            allowSendWhenInactive: false,
            isResumingSession: false
        }), {
            wrapper: createWrapper(queryClient)
        })

        await act(async () => {
            await result.current.composerHandlers.onModelChange?.('opus')
            await result.current.composerHandlers.onModelReasoningEffortChange?.('max')
        })

        expect(api.setModel).toHaveBeenCalledWith('session-1', 'opus')
        expect(api.setModelReasoningEffort).toHaveBeenCalledWith('session-1', 'max')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.model).toBe('opus')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.modelReasoningEffort).toBe('max')
        expect(invalidateQueries).not.toHaveBeenCalled()
        expect(platformHarness.success).toHaveBeenCalledTimes(2)
        expect(platformHarness.error).not.toHaveBeenCalled()
    })

    it('exposes Gemini live model handler without reasoning controls', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'gemini'
            },
            model: null,
            modelReasoningEffort: null
        })
        primeSessionCaches(queryClient, session)
        const api = {
            setModel: vi.fn(async () => ({
                ...session,
                model: 'gemini-2.5-flash-lite'
            }))
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionLiveConfigControls({
            api,
            session,
            liveConfigSupport: {
                isRemoteManaged: true,
                canChangePermissionMode: true,
                canChangeCollaborationMode: false,
                canChangeModel: true,
                canChangeModelReasoningEffort: false
            },
            onSwitchToRemote: vi.fn(async () => undefined),
            attachmentsSupported: true,
            allowSendWhenInactive: false,
            isResumingSession: false
        }), {
            wrapper: createWrapper(queryClient)
        })

        expect(result.current.composerHandlers.onModelReasoningEffortChange).toBeUndefined()

        await act(async () => {
            await result.current.composerHandlers.onModelChange?.('gemini-2.5-flash-lite')
        })

        expect(api.setModel).toHaveBeenCalledWith('session-1', 'gemini-2.5-flash-lite')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.model).toBe('gemini-2.5-flash-lite')
        expect(invalidateQueries).not.toHaveBeenCalled()
        expect(platformHarness.success).toHaveBeenCalledOnce()
        expect(platformHarness.error).not.toHaveBeenCalled()
    })
})
