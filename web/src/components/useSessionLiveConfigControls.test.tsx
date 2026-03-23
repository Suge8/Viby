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

describe('useSessionLiveConfigControls', () => {
    beforeEach(() => {
        platformHarness.success.mockReset()
        platformHarness.error.mockReset()
    })

    it('invalidates both detail and list caches after a successful live config update', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const onRefresh = vi.fn()
        const api = {
            setPermissionMode: vi.fn(async () => undefined)
        } as Partial<ApiClient> as ApiClient

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
            onRefresh,
            onSwitchToRemote: vi.fn(async () => undefined),
            attachmentsSupported: true,
            allowSendWhenInactive: false
        }), {
            wrapper: createWrapper(queryClient)
        })

        await act(async () => {
            await result.current.composerHandlers.onPermissionModeChange?.('read-only')
        })

        expect(api.setPermissionMode).toHaveBeenCalledWith('session-1', 'read-only')
        expect(invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: queryKeys.session('session-1') })
        expect(invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: queryKeys.sessions })
        expect(onRefresh).toHaveBeenCalledOnce()
        expect(platformHarness.success).toHaveBeenCalledOnce()
        expect(platformHarness.error).not.toHaveBeenCalled()
    })

    it('hides permission controls when the session cannot change permission mode', () => {
        const queryClient = createQueryClient()
        const api = {
            setPermissionMode: vi.fn(async () => undefined)
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionLiveConfigControls({
            api,
            session: createSession(),
            liveConfigSupport: {
                isRemoteManaged: false,
                canChangePermissionMode: false,
                canChangeCollaborationMode: false,
                canChangeModel: false,
                canChangeModelReasoningEffort: false
            },
            onRefresh: vi.fn(),
            onSwitchToRemote: vi.fn(async () => undefined),
            attachmentsSupported: true,
            allowSendWhenInactive: false
        }), {
            wrapper: createWrapper(queryClient)
        })

        expect(result.current.composerHandlers.onPermissionModeChange).toBeUndefined()
        expect(api.setPermissionMode).not.toHaveBeenCalled()
        expect(platformHarness.success).not.toHaveBeenCalled()
        expect(platformHarness.error).not.toHaveBeenCalled()
    })

    it('rejects invalid permission modes for the current flavor without mutating or invalidating cache', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const onRefresh = vi.fn()
        const api = {
            setPermissionMode: vi.fn(async () => undefined)
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
            onRefresh,
            onSwitchToRemote: vi.fn(async () => undefined),
            attachmentsSupported: true,
            allowSendWhenInactive: false
        }), {
            wrapper: createWrapper(queryClient)
        })

        await act(async () => {
            await result.current.composerHandlers.onPermissionModeChange?.('plan')
        })

        expect(api.setPermissionMode).not.toHaveBeenCalled()
        expect(invalidateQueries).not.toHaveBeenCalled()
        expect(onRefresh).not.toHaveBeenCalled()
        expect(platformHarness.success).not.toHaveBeenCalled()
        expect(platformHarness.error).toHaveBeenCalledOnce()

        errorSpy.mockRestore()
    })
})
