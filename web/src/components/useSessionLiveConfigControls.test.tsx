// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { AGENT_FLAVORS, getLiveSessionConfigSupport } from '@viby/protocol'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Session } from '@/types/api'
import { useSessionLiveConfigControls } from './useSessionLiveConfigControls'

const platformHarness = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    addToast: vi.fn(),
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
            },
        },
    }),
}))

vi.mock('@/lib/notice-center', () => ({
    useNoticeCenter: () => ({
        addToast: platformHarness.addToast,
    }),
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

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
            path: '/tmp/project',
            host: 'localhost',
            driver: 'codex',
        },
        agentState: {
            controlledByUser: false,
        },
        ...overrides,
    } as Session
}

function primeSessionCaches(queryClient: QueryClient, session: Session): void {
    queryClient.setQueryData(queryKeys.session(session.id), {
        session,
    })
    queryClient.setQueryData(queryKeys.sessions, {
        sessions: [
            {
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
                    driver: session.metadata?.driver ?? null,
                },
                todoProgress: null,
                pendingRequestsCount: 0,
                resumeAvailable: false,
                resumeStrategy: 'none',
                permissionMode: session.permissionMode,
                collaborationMode: session.collaborationMode,
                model: session.model,
                modelReasoningEffort: session.modelReasoningEffort,
            },
        ],
    })
}

function createOptions(
    overrides?: Partial<Parameters<typeof useSessionLiveConfigControls>[0]>
): Parameters<typeof useSessionLiveConfigControls>[0] {
    return {
        api: {} as ApiClient,
        session: createSession(),
        liveConfigSupport: {
            isRemoteManaged: true,
            canChangePermissionMode: true,
            canChangeCollaborationMode: true,
            canChangeModel: true,
            canChangeModelReasoningEffort: true,
        },
        onSwitchSessionDriver: vi.fn(async () => undefined),
        isSwitchingSessionDriver: false,
        agentAvailability: AGENT_FLAVORS.map((driver) => ({
            driver,
            status: 'ready' as const,
            resolution: 'none' as const,
            code: 'ready' as const,
            detectedAt: 1,
        })),
        attachmentsSupported: true,
        allowSendWhenInactive: false,
        ...overrides,
    }
}

describe('useSessionLiveConfigControls', () => {
    beforeEach(() => {
        platformHarness.success.mockReset()
        platformHarness.error.mockReset()
        platformHarness.addToast.mockReset()
    })

    it('writes the updated live config snapshot directly into both caches', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const session = createSession()
        primeSessionCaches(queryClient, session)
        const api = {
            setPermissionMode: vi.fn(async () => ({
                ...session,
                permissionMode: 'read-only' as const,
            })),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSessionLiveConfigControls(createOptions({ api, session })), {
            wrapper: createWrapper(queryClient),
        })

        await act(async () => {
            await result.current.composerHandlers.onPermissionModeChange?.('read-only')
        })

        expect(api.setPermissionMode).toHaveBeenCalledWith('session-1', 'read-only')
        expect(
            queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.permissionMode
        ).toBe('read-only')
        expect(
            queryClient.getQueryData<{ sessions: Array<{ permissionMode: string }> }>(queryKeys.sessions)?.sessions[0]
                ?.permissionMode
        ).toBe('read-only')
        expect(invalidateQueries).not.toHaveBeenCalled()
        expect(platformHarness.success).toHaveBeenCalledOnce()
        expect(platformHarness.error).not.toHaveBeenCalled()
    })

    it('derives Pi capability-backed model and reasoning controls from authoritative metadata', () => {
        const queryClient = createQueryClient()
        const { result } = renderHook(
            () =>
                useSessionLiveConfigControls(
                    createOptions({
                        session: createSession({
                            model: 'openai/gpt-5.4-mini',
                            metadata: {
                                path: '/tmp/project',
                                host: 'localhost',
                                driver: 'pi',
                                piModelScope: {
                                    models: [
                                        {
                                            id: 'openai/gpt-5.4',
                                            label: 'GPT-5.4',
                                            supportedThinkingLevels: ['none', 'low', 'medium', 'high'],
                                        },
                                        {
                                            id: 'openai/gpt-5.4-mini',
                                            label: 'GPT-5.4 Mini',
                                            supportedThinkingLevels: ['none', 'low'],
                                        },
                                    ],
                                },
                            } as Session['metadata'],
                            agentState: { controlledByUser: false },
                        }),
                    })
                ),
            { wrapper: createWrapper(queryClient) }
        )

        expect(result.current.composerConfig.piModelCapabilities).toEqual([
            {
                id: 'openai/gpt-5.4',
                label: 'GPT-5.4',
                supportedThinkingLevels: ['none', 'low', 'medium', 'high'],
            },
            {
                id: 'openai/gpt-5.4-mini',
                label: 'GPT-5.4 Mini',
                supportedThinkingLevels: ['none', 'low'],
            },
        ])
        expect(result.current.composerConfig.availableReasoningEfforts).toEqual(['none', 'low'])
    })

    it('derives switch targets from the authoritative current driver', () => {
        const queryClient = createQueryClient()
        const { result: codexResult } = renderHook(
            () =>
                useSessionLiveConfigControls(
                    createOptions({
                        session: createSession({
                            metadata: {
                                path: '/tmp/project',
                                host: 'localhost',
                                driver: 'codex',
                            },
                            agentState: { controlledByUser: true },
                        }),
                    })
                ),
            { wrapper: createWrapper(queryClient) }
        )
        const { result: claudeResult } = renderHook(
            () =>
                useSessionLiveConfigControls(
                    createOptions({
                        session: createSession({
                            metadata: {
                                path: '/tmp/project',
                                host: 'localhost',
                                driver: 'claude',
                            },
                        }),
                    })
                ),
            { wrapper: createWrapper(queryClient) }
        )

        expect(codexResult.current.composerConfig.switchTargetDrivers).toEqual([
            'claude',
            'gemini',
            'opencode',
            'cursor',
            'pi',
            'copilot',
        ])
        expect(claudeResult.current.composerConfig.switchTargetDrivers).toEqual([
            'codex',
            'gemini',
            'opencode',
            'cursor',
            'pi',
            'copilot',
        ])
    })

    it('exposes the full seven-agent switch matrix without inventing web-local targets', () => {
        const queryClient = createQueryClient()

        for (const driver of AGENT_FLAVORS) {
            const session = createSession({
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    driver,
                },
            })
            const { result } = renderHook(
                () =>
                    useSessionLiveConfigControls(
                        createOptions({
                            session,
                            liveConfigSupport: getLiveSessionConfigSupport(session),
                        })
                    ),
                { wrapper: createWrapper(queryClient) }
            )

            expect(result.current.composerConfig.switchTargetDrivers).toEqual(
                AGENT_FLAVORS.filter((candidate) => candidate !== driver)
            )
            expect(result.current.composerHandlers.onSwitchSessionDriver).toBeDefined()
        }
    })

    it('filters switch targets to locally ready drivers only', () => {
        const queryClient = createQueryClient()
        const { result } = renderHook(
            () =>
                useSessionLiveConfigControls(
                    createOptions({
                        agentAvailability: [
                            { driver: 'claude', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                            { driver: 'codex', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                            {
                                driver: 'gemini',
                                status: 'not_installed',
                                resolution: 'install',
                                code: 'command_missing',
                                detectedAt: 1,
                            },
                            { driver: 'opencode', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                            {
                                driver: 'cursor',
                                status: 'setup_required',
                                resolution: 'configure',
                                code: 'auth_missing',
                                detectedAt: 1,
                            },
                            { driver: 'pi', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                            {
                                driver: 'copilot',
                                status: 'unavailable',
                                resolution: 'learn_more',
                                code: 'provider_unavailable',
                                detectedAt: 1,
                            },
                        ],
                    })
                ),
            { wrapper: createWrapper(queryClient) }
        )

        expect(result.current.composerConfig.switchTargetDrivers).toEqual(['claude', 'opencode', 'pi'])
    })

    it('matches the expected control-surface capability matrix for all seven drivers', () => {
        const queryClient = createQueryClient()
        const expectations = {
            claude: {
                hasCollaboration: false,
                hasModel: true,
                hasReasoning: true,
            },
            codex: {
                hasCollaboration: true,
                hasModel: true,
                hasReasoning: true,
            },
            copilot: {
                hasCollaboration: false,
                hasModel: true,
                hasReasoning: false,
            },
            gemini: {
                hasCollaboration: false,
                hasModel: true,
                hasReasoning: false,
            },
            opencode: {
                hasCollaboration: false,
                hasModel: false,
                hasReasoning: false,
            },
            cursor: {
                hasCollaboration: false,
                hasModel: false,
                hasReasoning: false,
            },
            pi: {
                hasCollaboration: false,
                hasModel: true,
                hasReasoning: true,
            },
        } as const

        for (const driver of AGENT_FLAVORS) {
            const session = createSession({
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    driver,
                },
            })

            const { result } = renderHook(
                () =>
                    useSessionLiveConfigControls(
                        createOptions({
                            session,
                            liveConfigSupport: getLiveSessionConfigSupport(session),
                        })
                    ),
                { wrapper: createWrapper(queryClient) }
            )

            expect(Boolean(result.current.composerHandlers.onPermissionModeChange)).toBe(true)
            expect(Boolean(result.current.composerHandlers.onCollaborationModeChange)).toBe(
                expectations[driver].hasCollaboration
            )
            expect(Boolean(result.current.composerHandlers.onModelChange)).toBe(expectations[driver].hasModel)
            expect(Boolean(result.current.composerHandlers.onModelReasoningEffortChange)).toBe(
                expectations[driver].hasReasoning
            )
        }
    })

    it('suppresses the switch action for unsupported or inactive sessions', () => {
        const queryClient = createQueryClient()
        const { result: unsupportedResult } = renderHook(
            () =>
                useSessionLiveConfigControls(
                    createOptions({
                        session: createSession({
                            metadata: {
                                path: '/tmp/project',
                                host: 'localhost',
                                driver: null,
                            },
                        }),
                    })
                ),
            { wrapper: createWrapper(queryClient) }
        )
        const { result: inactiveResult } = renderHook(
            () =>
                useSessionLiveConfigControls(
                    createOptions({
                        session: createSession({
                            active: false,
                            metadata: {
                                path: '/tmp/project',
                                host: 'localhost',
                                driver: 'claude',
                            },
                        }),
                    })
                ),
            { wrapper: createWrapper(queryClient) }
        )

        expect(unsupportedResult.current.composerConfig.switchTargetDrivers).toBeNull()
        expect(unsupportedResult.current.composerHandlers.onSwitchSessionDriver).toBeUndefined()
        expect(inactiveResult.current.composerConfig.switchTargetDrivers).toBeNull()
        expect(inactiveResult.current.composerHandlers.onSwitchSessionDriver).toBeUndefined()
    })

    it('exposes switch pending state from the mutation owner without a local copy', () => {
        const queryClient = createQueryClient()
        const { result } = renderHook(
            () => useSessionLiveConfigControls(createOptions({ isSwitchingSessionDriver: true })),
            { wrapper: createWrapper(queryClient) }
        )

        expect(result.current.composerConfig.switchDriverPending).toBe(true)
    })

    it('shows a localized danger toast for session_not_idle switch failures', async () => {
        const queryClient = createQueryClient()
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const onSwitchSessionDriver = vi.fn(async () => {
            throw Object.assign(new Error('HTTP 409 Conflict: session busy'), {
                code: 'session_not_idle',
            })
        })
        const { result } = renderHook(() => useSessionLiveConfigControls(createOptions({ onSwitchSessionDriver })), {
            wrapper: createWrapper(queryClient),
        })

        await act(async () => {
            await result.current.composerHandlers.onSwitchSessionDriver?.('claude')
        })

        expect(onSwitchSessionDriver).toHaveBeenCalledOnce()
        expect(platformHarness.error).toHaveBeenCalledOnce()
        expect(platformHarness.success).not.toHaveBeenCalled()
        expect(platformHarness.addToast).toHaveBeenCalledWith({
            title: 'chat.switchDriver.failed.title',
            description: 'chat.switchDriver.failed.sessionNotIdle',
            tone: 'danger',
        })
        errorSpy.mockRestore()
    })

    it('falls back to generic switch copy for malformed or technical failures', async () => {
        const queryClient = createQueryClient()
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const onSwitchSessionDriver = vi.fn(async () => {
            throw new Error('gRPC transport closed while attaching switched session')
        })
        const { result } = renderHook(() => useSessionLiveConfigControls(createOptions({ onSwitchSessionDriver })), {
            wrapper: createWrapper(queryClient),
        })

        await act(async () => {
            await result.current.composerHandlers.onSwitchSessionDriver?.('claude')
        })

        expect(platformHarness.addToast).toHaveBeenCalledWith({
            title: 'chat.switchDriver.failed.title',
            description: 'chat.switchDriver.failed.generic',
            tone: 'danger',
        })
        errorSpy.mockRestore()
    })

    it('maps target_driver_unavailable failures to the dedicated copy', async () => {
        const queryClient = createQueryClient()
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const onSwitchSessionDriver = vi.fn(async () => {
            throw Object.assign(new Error('target unavailable'), {
                code: 'target_driver_unavailable',
            })
        })
        const { result } = renderHook(() => useSessionLiveConfigControls(createOptions({ onSwitchSessionDriver })), {
            wrapper: createWrapper(queryClient),
        })

        await act(async () => {
            await result.current.composerHandlers.onSwitchSessionDriver?.('claude')
        })

        expect(platformHarness.addToast).toHaveBeenCalledWith({
            title: 'chat.switchDriver.failed.title',
            description: 'chat.switchDriver.failed.targetUnavailable',
            tone: 'danger',
        })
        errorSpy.mockRestore()
    })

    it('does not run a second switch while the authoritative mutation is pending', async () => {
        const queryClient = createQueryClient()
        const onSwitchSessionDriver = vi.fn(async () => undefined)
        const { result } = renderHook(
            () =>
                useSessionLiveConfigControls(
                    createOptions({
                        onSwitchSessionDriver,
                        isSwitchingSessionDriver: true,
                    })
                ),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.composerHandlers.onSwitchSessionDriver?.('claude')
        })

        expect(onSwitchSessionDriver).not.toHaveBeenCalled()
        expect(platformHarness.addToast).not.toHaveBeenCalled()
        expect(platformHarness.success).not.toHaveBeenCalled()
        expect(platformHarness.error).not.toHaveBeenCalled()
    })

    it('surfaces failed live-config mutations without mutating cache', async () => {
        const queryClient = createQueryClient()
        const session = createSession()
        primeSessionCaches(queryClient, session)
        const api = {
            setPermissionMode: vi.fn(async () => {
                throw new Error('boom')
            }),
        } as Partial<ApiClient> as ApiClient
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const { result } = renderHook(() => useSessionLiveConfigControls(createOptions({ api, session })), {
            wrapper: createWrapper(queryClient),
        })

        await act(async () => {
            await result.current.composerHandlers.onPermissionModeChange?.('read-only')
        })

        expect(
            queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session.permissionMode
        ).toBe('default')
        expect(platformHarness.success).not.toHaveBeenCalled()
        expect(platformHarness.error).toHaveBeenCalledOnce()
        errorSpy.mockRestore()
    })
})
