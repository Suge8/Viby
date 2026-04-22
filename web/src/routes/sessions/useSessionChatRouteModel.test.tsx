// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ApiClient, ApiError } from '@/api/client'
import type { PendingReplyState } from '@/lib/messageWindowStoreCore'
import {
    MESSAGE_WINDOW_POST_SWITCH_SEND_FAILED_WARNING_KEY,
    type MessageWindowWarningKey,
} from '@/lib/messageWindowWarnings'
import type { DecryptedMessage, Session, SessionStreamState } from '@/types/api'
import { useSessionChatRouteModel } from './useSessionChatRouteModel'

const harness = vi.hoisted(() => ({
    addToast: vi.fn(),
    appendRealtimeTrace: vi.fn(),
    clearMessageWindowWarning: vi.fn(),
    clearPendingReply: vi.fn(),
    fetchLatestMessages: vi.fn(async () => undefined),
    getMessageWindowState: vi.fn<() => { messages: DecryptedMessage[]; warning: MessageWindowWarningKey | null }>(
        () => ({ messages: [], warning: null })
    ),
    goBack: vi.fn(),
    runSendCatchup: vi.fn(),
    sendMessage: vi.fn(),
    retryMessage: vi.fn(),
    sendMessageOptions: null as null | Record<string, unknown>,
    setAtBottom: vi.fn(),
    setMessageWindowWarning: vi.fn(),
    subscribeMessageWindow: vi.fn(() => () => undefined),
    writeSessionToQueryCache: vi.fn(),
}))

vi.mock('@/hooks/useAppGoBack', () => ({
    useAppGoBack: () => harness.goBack,
}))

vi.mock('@/hooks/mutations/useSendMessage', () => ({
    useSendMessage: (_api: unknown, _sessionId: string, options: Record<string, unknown>) => {
        harness.sendMessageOptions = options
        return {
            sendMessage: harness.sendMessage,
            retryMessage: harness.retryMessage,
            isSending: false,
        }
    },
}))

type LoadMoreResult = {
    didLoadOlderMessages: boolean
}

type MessagesState = {
    messages: DecryptedMessage[]
    warning: MessageWindowWarningKey | null
    isLoading: boolean
    isLoadingMore: boolean
    hasMore: boolean
    loadHistoryUntilPreviousUser: () => Promise<LoadMoreResult>
    pendingCount: number
    hasLoadedLatest: boolean
    messagesVersion: number
    pendingReply: PendingReplyState | null
    stream: SessionStreamState | null
    streamVersion: number
    flushPending: () => Promise<void>
    setAtBottom: (atBottom: boolean) => void
}

const messagesState: MessagesState = {
    messages: [] as DecryptedMessage[],
    warning: null as MessageWindowWarningKey | null,
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    loadHistoryUntilPreviousUser: vi.fn(async () => ({ didLoadOlderMessages: false })),
    pendingCount: 0,
    hasLoadedLatest: true,
    messagesVersion: 0,
    pendingReply: null,
    stream: null,
    streamVersion: 0,
    flushPending: vi.fn(async () => undefined),
    setAtBottom: harness.setAtBottom,
}

vi.mock('@/hooks/queries/useMessages', () => ({
    useMessages: () => messagesState,
}))

vi.mock('@/lib/messageWindowStoreCore', () => ({
    clearMessageWindowWarning: harness.clearMessageWindowWarning,
    clearPendingReply: harness.clearPendingReply,
    getMessageWindowState: harness.getMessageWindowState,
    setMessageWindowWarning: harness.setMessageWindowWarning,
    subscribeMessageWindow: harness.subscribeMessageWindow,
}))

vi.mock('@/lib/message-window-store', () => ({
    fetchLatestMessages: harness.fetchLatestMessages,
}))

vi.mock('@/lib/notice-center', () => ({
    useNoticeCenter: () => ({
        addToast: harness.addToast,
    }),
}))

vi.mock('@/lib/realtimeTrace', () => ({
    appendRealtimeTrace: harness.appendRealtimeTrace,
}))

vi.mock('@/lib/sendCatchup', async () => {
    const actual = await vi.importActual<typeof import('@/lib/sendCatchup')>('@/lib/sendCatchup')
    return {
        ...actual,
        runSendCatchup: harness.runSendCatchup,
    }
})

vi.mock('@/lib/sessionQueryCache', () => ({
    writeSessionToQueryCache: harness.writeSessionToQueryCache,
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

vi.mock('@/routes/sessions/sessionAutocomplete', () => ({
    createSessionAutocompleteSuggestions: () => vi.fn(async () => []),
}))

vi.mock('@/routes/sessions/sessionChatRouteRuntime', () => ({
    useSessionChatTracing: vi.fn(),
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

function createSession(): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 100,
        updatedAt: 120,
        active: true,
        activeAt: 120,
        metadata: {
            path: '/repo',
            host: 'demo.local',
            driver: 'codex',
            lifecycleState: 'running',
            lifecycleStateSince: 120,
        },
        metadataVersion: 1,
        agentState: {
            controlledByUser: false,
            requests: {},
            completedRequests: {},
        },
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 120,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'default',
        collaborationMode: 'default',
    }
}

function createUserMessage(createdAt: number): DecryptedMessage {
    return {
        id: `user-${createdAt}`,
        seq: createdAt,
        localId: null,
        createdAt,
        content: {
            role: 'user',
            content: {
                type: 'text',
                text: 'hello',
            },
        },
    }
}

function createAgentMessage(createdAt: number): DecryptedMessage {
    return {
        id: `agent-${createdAt}`,
        seq: createdAt,
        localId: null,
        createdAt,
        content: {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'message',
                    message: 'reply',
                },
            },
        },
    }
}

describe('useSessionChatRouteModel', () => {
    beforeEach(() => {
        harness.addToast.mockReset()
        harness.appendRealtimeTrace.mockReset()
        harness.clearMessageWindowWarning.mockReset()
        harness.clearPendingReply.mockReset()
        harness.fetchLatestMessages.mockReset()
        harness.getMessageWindowState.mockReset()
        harness.getMessageWindowState.mockImplementation(() => ({ messages: [], warning: null }))
        harness.goBack.mockReset()
        harness.runSendCatchup.mockReset()
        harness.sendMessage.mockReset()
        harness.retryMessage.mockReset()
        harness.sendMessageOptions = null
        harness.setAtBottom.mockReset()
        harness.setMessageWindowWarning.mockReset()
        harness.subscribeMessageWindow.mockReset()
        harness.subscribeMessageWindow.mockImplementation(() => () => undefined)
        harness.writeSessionToQueryCache.mockReset()

        messagesState.messages = []
        messagesState.warning = null
        messagesState.hasLoadedLatest = true
        messagesState.pendingReply = null
        messagesState.stream = null
        messagesState.messagesVersion = 0
        messagesState.streamVersion = 0
    })

    it('keeps the chat route pending until the message-window owner confirms latest messages are hydrated', () => {
        const queryClient = createQueryClient()
        messagesState.hasLoadedLatest = false

        const { result } = renderHook(
            () =>
                useSessionChatRouteModel({
                    api: {} as ApiClient,
                    session: createSession(),
                    sessionId: 'session-1',
                }),
            {
                wrapper: createWrapper(queryClient),
            }
        )

        expect(result.current.isSessionDetailReady).toBe(false)
    })

    it('skips post-switch catch-up entirely for ordinary sends with no fresh driver-switched marker', async () => {
        const queryClient = createQueryClient()
        const api = {
            getSession: vi.fn(async () => ({ session: createSession() })),
        } as unknown as ApiClient

        messagesState.messages = [createUserMessage(80)]
        harness.getMessageWindowState.mockImplementation(() => ({
            messages: messagesState.messages,
            warning: messagesState.warning,
        }))

        renderHook(
            () =>
                useSessionChatRouteModel({
                    api,
                    session: createSession(),
                    sessionId: 'session-1',
                }),
            {
                wrapper: createWrapper(queryClient),
            }
        )

        const afterServerAccepted = harness.sendMessageOptions?.afterServerAccepted as (payload: {
            sessionId: string
            localId: string
            createdAt: number
            acceptedAt: number
            session: Session
        }) => Promise<void>

        await afterServerAccepted({
            sessionId: 'session-1',
            localId: 'local-1',
            createdAt: 100,
            acceptedAt: 120,
            session: createSession(),
        })

        expect(harness.runSendCatchup).not.toHaveBeenCalled()
        expect(harness.setMessageWindowWarning).not.toHaveBeenCalled()
        expect(harness.clearPendingReply).not.toHaveBeenCalled()
    })

    it('stays quiet when catch-up finds a real reply for the first post-switch send', async () => {
        const queryClient = createQueryClient()
        const api = {
            getSession: vi.fn(async () => ({ session: createSession() })),
        } as unknown as ApiClient

        messagesState.messages = [
            createUserMessage(80),
            {
                id: 'switch-90',
                seq: 90,
                localId: null,
                createdAt: 90,
                content: {
                    role: 'agent',
                    content: {
                        type: 'event',
                        data: {
                            type: 'driver-switched',
                            targetDriver: 'claude',
                        },
                    },
                },
            },
        ]
        harness.getMessageWindowState.mockImplementation(() => ({
            messages: messagesState.messages,
            warning: messagesState.warning,
        }))

        harness.runSendCatchup.mockResolvedValue({
            type: 'reply-detected',
            reply: createAgentMessage(130),
            attempt: 2,
        })

        renderHook(
            () =>
                useSessionChatRouteModel({
                    api,
                    session: createSession(),
                    sessionId: 'session-1',
                }),
            {
                wrapper: createWrapper(queryClient),
            }
        )

        const afterServerAccepted = harness.sendMessageOptions?.afterServerAccepted as (payload: {
            sessionId: string
            localId: string
            createdAt: number
            acceptedAt: number
            session: Session
        }) => Promise<void>

        await afterServerAccepted({
            sessionId: 'session-1',
            localId: 'local-1',
            createdAt: 100,
            acceptedAt: 120,
            session: createSession(),
        })

        expect(harness.runSendCatchup).toHaveBeenCalledTimes(1)
        expect(harness.setMessageWindowWarning).not.toHaveBeenCalled()
        expect(harness.clearPendingReply).not.toHaveBeenCalled()
        expect(harness.appendRealtimeTrace).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'first_reply_detected',
                details: expect.objectContaining({
                    sessionId: 'session-1',
                    attempt: 2,
                }),
            })
        )
    })

    it('writes one post-switch failure warning when catch-up sees a dedicated failure event', async () => {
        const queryClient = createQueryClient()
        const api = {
            getSession: vi.fn(async () => ({ session: createSession() })),
        } as unknown as ApiClient

        messagesState.messages = [
            createUserMessage(80),
            {
                id: 'switch-90',
                seq: 90,
                localId: null,
                createdAt: 90,
                content: {
                    role: 'agent',
                    content: {
                        type: 'event',
                        data: {
                            type: 'driver-switched',
                            targetDriver: 'claude',
                        },
                    },
                },
            },
        ]
        harness.getMessageWindowState.mockImplementation(() => ({
            messages: messagesState.messages,
            warning: messagesState.warning,
        }))

        harness.runSendCatchup.mockResolvedValue({
            type: 'driver-switch-send-failed',
            event: {
                type: 'driver-switch-send-failed',
                code: 'empty_first_turn',
                stage: 'callback_flush',
            },
            attempt: 1,
        })

        renderHook(
            () =>
                useSessionChatRouteModel({
                    api,
                    session: createSession(),
                    sessionId: 'session-1',
                }),
            {
                wrapper: createWrapper(queryClient),
            }
        )

        const afterServerAccepted = harness.sendMessageOptions?.afterServerAccepted as (payload: {
            sessionId: string
            localId: string
            createdAt: number
            acceptedAt: number
            session: Session
        }) => Promise<void>

        await afterServerAccepted({
            sessionId: 'session-1',
            localId: 'local-1',
            createdAt: 100,
            acceptedAt: 120,
            session: createSession(),
        })

        expect(harness.setMessageWindowWarning).toHaveBeenCalledWith(
            'session-1',
            MESSAGE_WINDOW_POST_SWITCH_SEND_FAILED_WARNING_KEY
        )
        expect(harness.clearPendingReply).toHaveBeenCalledWith('session-1')
        expect(harness.appendRealtimeTrace).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'post_switch_send_failed',
                details: expect.objectContaining({
                    sessionId: 'session-1',
                    code: 'empty_first_turn',
                    stage: 'callback_flush',
                }),
            })
        )
    })

    it('stays quiet when bounded catch-up ends without durable failure evidence', async () => {
        const queryClient = createQueryClient()
        const api = {
            getSession: vi.fn(async () => ({ session: createSession() })),
        } as unknown as ApiClient

        messagesState.messages = [
            createUserMessage(80),
            {
                id: 'switch-90',
                seq: 90,
                localId: null,
                createdAt: 90,
                content: {
                    role: 'agent',
                    content: {
                        type: 'event',
                        data: {
                            type: 'driver-switched',
                            targetDriver: 'claude',
                        },
                    },
                },
            },
        ]
        harness.getMessageWindowState.mockImplementation(() => ({
            messages: messagesState.messages,
            warning: messagesState.warning,
        }))

        harness.runSendCatchup.mockResolvedValue({
            type: 'no-evidence',
            attemptCount: 8,
        })

        renderHook(
            () =>
                useSessionChatRouteModel({
                    api,
                    session: createSession(),
                    sessionId: 'session-1',
                }),
            {
                wrapper: createWrapper(queryClient),
            }
        )

        const afterServerAccepted = harness.sendMessageOptions?.afterServerAccepted as (payload: {
            sessionId: string
            localId: string
            createdAt: number
            acceptedAt: number
            session: Session
        }) => Promise<void>

        await afterServerAccepted({
            sessionId: 'session-1',
            localId: 'local-1',
            createdAt: 100,
            acceptedAt: 120,
            session: createSession(),
        })

        expect(harness.setMessageWindowWarning).not.toHaveBeenCalled()
        expect(harness.clearPendingReply).not.toHaveBeenCalled()
    })

    it('hides retry ownership for inactive sessions without a durable resume marker', async () => {
        const queryClient = createQueryClient()

        const closedSession = createSession()

        const { result } = renderHook(
            () =>
                useSessionChatRouteModel({
                    api: {} as ApiClient,
                    session: {
                        ...closedSession,
                        active: false,
                        metadata: {
                            path: '/repo',
                            host: 'demo.local',
                            driver: 'codex',
                            lifecycleState: 'closed',
                            lifecycleStateSince: 120,
                        },
                    },
                    sessionId: 'session-1',
                }),
            {
                wrapper: createWrapper(queryClient),
            }
        )

        expect(result.current.sessionChatProps.actions.onRetryMessage).toBeUndefined()
    })

    it('keeps retry ownership for inactive sessions with a durable resume marker', async () => {
        const queryClient = createQueryClient()

        const { result } = renderHook(
            () =>
                useSessionChatRouteModel({
                    api: {} as ApiClient,
                    session: {
                        ...createSession(),
                        active: false,
                        metadata: {
                            path: '/repo',
                            host: 'demo.local',
                            driver: 'codex',
                            lifecycleState: 'archived',
                            lifecycleStateSince: 120,
                            runtimeHandles: {
                                codex: {
                                    sessionId: 'thread-1',
                                },
                            },
                        },
                    },
                    sessionId: 'session-1',
                }),
            {
                wrapper: createWrapper(queryClient),
            }
        )

        expect(result.current.sessionChatProps.actions.onRetryMessage).toBe(harness.retryMessage)
    })

    it('shows the mapped recovery toast when the Hub-owned send chain rejects during recovery', async () => {
        const queryClient = createQueryClient()

        renderHook(
            () =>
                useSessionChatRouteModel({
                    api: {} as ApiClient,
                    session: createSession(),
                    sessionId: 'session-1',
                }),
            {
                wrapper: createWrapper(queryClient),
            }
        )

        const onSendError = harness.sendMessageOptions?.onSendError as (payload: {
            sessionId: string
            localId: string
            createdAt: number
            error: unknown
        }) => void

        onSendError({
            sessionId: 'session-1',
            localId: 'local-1',
            createdAt: 100,
            error: new ApiError('HTTP 409 Conflict: No machine online', 409, 'no_machine_online'),
        })

        expect(harness.addToast).toHaveBeenCalledWith({
            title: 'chat.resumeFailed.title',
            description: 'chat.resumeFailed.noMachineOnline',
            tone: 'danger',
            href: '/sessions/session-1',
        })
    })

    it('clears post-switch warnings once fresh post-switch evidence appears in the existing message window owner', async () => {
        const queryClient = createQueryClient()
        const api = {
            getSession: vi.fn(async () => ({ session: createSession() })),
        } as unknown as ApiClient

        messagesState.warning = MESSAGE_WINDOW_POST_SWITCH_SEND_FAILED_WARNING_KEY
        messagesState.messages = [createUserMessage(100), createAgentMessage(101)]
        harness.getMessageWindowState.mockImplementation(() => ({
            messages: messagesState.messages,
            warning: messagesState.warning,
        }))

        renderHook(
            () =>
                useSessionChatRouteModel({
                    api,
                    session: createSession(),
                    sessionId: 'session-1',
                }),
            {
                wrapper: createWrapper(queryClient),
            }
        )

        await waitFor(() => {
            expect(harness.clearMessageWindowWarning).toHaveBeenCalledWith(
                'session-1',
                MESSAGE_WINDOW_POST_SWITCH_SEND_FAILED_WARNING_KEY
            )
        })
    })
})
