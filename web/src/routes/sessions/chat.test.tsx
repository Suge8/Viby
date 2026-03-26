import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SessionChatRoute from './chat'

const useParamsMock = vi.fn()
const navigateMock = vi.fn()
const useSessionMock = vi.fn()
const sessionChatPropsMock = vi.fn()
const addToastMock = vi.fn()
const sendMessageOptionsMock = vi.fn()
const routeHarness = vi.hoisted(() => ({
    appendRealtimeTraceMock: vi.fn(),
    clearPendingReplyMock: vi.fn(),
    loadSessionChatWorkspaceModule: vi.fn(async () => ({ default: () => null })),
    messagesState: {
        messages: [],
        warning: null,
        isLoading: false,
        isLoadingMore: false,
        hasMore: false,
        loadMore: vi.fn(async () => undefined),
        refetch: vi.fn(),
        pendingCount: 0,
        hasLoadedLatest: true,
        messagesVersion: 0,
        pendingReply: null as {
            localId: string
            requestStartedAt: number
            serverAcceptedAt: number | null
            phase: 'sending' | 'preparing'
        } | null,
        stream: null as { streamId: string; startedAt: number; updatedAt: number; text: string } | null,
        streamVersion: 0,
        flushPending: vi.fn(),
        setAtBottom: vi.fn(),
    }
}))
const resolverOptionsRef: {
    current: null | {
        onReady: (session: { id: string; active: boolean }) => void
        onError: (error: unknown, currentSessionId: string) => void
    }
} = { current: null }
const setQueryDataMock = vi.fn()
const useFinalizeBootShellMock = vi.fn()

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({
        setQueryData: setQueryDataMock,
        prefetchQuery: vi.fn(() => Promise.resolve()),
        fetchQuery: vi.fn(() => Promise.resolve()),
    })
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
}))

vi.mock('@/components/loading/RouteLoadingFallback', () => ({
    RouteLoadingFallback: (props: { kind?: string; testId?: string }) => (
        <div data-testid={props.testId ?? 'route-loading-fallback'}>{props.kind ?? 'workspace'}</div>
    ),
}))

vi.mock('@/components/SessionChat', () => ({
    SessionChat: (props: unknown) => {
        sessionChatPropsMock(props)
        return <div data-testid="session-chat" />
    }
}))

vi.mock('@/hooks/useAppGoBack', () => ({
    useAppGoBack: () => vi.fn()
}))

vi.mock('@/hooks/mutations/useSendMessage', () => ({
    useSendMessage: (_api: unknown, _sessionId: string, options: unknown) => {
        sendMessageOptionsMock(options)
        return {
        sendMessage: vi.fn(),
        retryMessage: vi.fn(),
        isSending: false,
        }
    }
}))

vi.mock('@/hooks/queries/useMessages', () => ({
    useMessages: () => routeHarness.messagesState
}))

vi.mock('@/hooks/queries/useSession', () => ({
    useSession: (...args: unknown[]) => useSessionMock(...args)
}))

vi.mock('@/hooks/useFinalizeBootShell', () => ({
    useFinalizeBootShell: (when?: boolean) => useFinalizeBootShellMock(when)
}))

vi.mock('@/hooks/useSessionTargetResolver', () => ({
    useSessionTargetResolver: (options: {
        onReady: (session: { id: string; active: boolean }) => void
        onError: (error: unknown, currentSessionId: string) => void
    }) => {
        resolverOptionsRef.current = options
        return vi.fn(async () => undefined)
    }
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: null
    })
}))

vi.mock('@/lib/messageWindowStoreCore', () => ({
    clearPendingReply: routeHarness.clearPendingReplyMock,
    getMessageWindowState: vi.fn(() => ({ messages: [] })),
    seedMessageWindowFromSession: vi.fn(),
}))

vi.mock('@/lib/messageWindowStoreModule', () => ({
    loadMessageWindowStoreAsyncModule: vi.fn(async () => ({
        fetchLatestMessages: vi.fn(async () => undefined)
    }))
}))

vi.mock('@/lib/notice-center', () => ({
    useNoticeCenter: () => ({
        addToast: addToastMock
    })
}))

vi.mock('@/lib/noticePresets', () => ({
    getNoticePreset: () => ({
        title: 'Something went wrong'
    })
}))

vi.mock('@/lib/query-keys', () => ({
    queryKeys: {
        session: (sessionId: string) => ['session', sessionId]
    }
}))

vi.mock('@/lib/realtimeTrace', () => ({
    appendRealtimeTrace: routeHarness.appendRealtimeTraceMock
}))

vi.mock('@/lib/sendCatchup', () => ({
    runSendCatchup: vi.fn(async () => undefined)
}))

vi.mock('@/routes/sessions/sessionRoutePreload', () => ({
    loadSessionChatWorkspaceModule: () => routeHarness.loadSessionChatWorkspaceModule()
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key
    })
}))

function createSession(sessionId: string) {
    return {
        id: sessionId,
        active: true,
        thinking: false,
        metadata: {
            flavor: 'codex'
        },
        agentState: {
            controlledByUser: false
        }
    }
}

const sessionStateRef: {
    current: ReturnType<typeof createSession>
} = {
    current: createSession('session-1')
}

describe('SessionChatRoute', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        useParamsMock.mockReturnValue({ sessionId: 'session-1' })
        navigateMock.mockReset()
        sessionChatPropsMock.mockReset()
        addToastMock.mockReset()
        sendMessageOptionsMock.mockReset()
        routeHarness.appendRealtimeTraceMock.mockReset()
        routeHarness.clearPendingReplyMock.mockReset()
        routeHarness.loadSessionChatWorkspaceModule.mockReset()
        setQueryDataMock.mockReset()
        useFinalizeBootShellMock.mockReset()
        resolverOptionsRef.current = null
        sessionStateRef.current = createSession('session-1')
        routeHarness.messagesState = {
            messages: [],
            warning: null,
            isLoading: false,
            isLoadingMore: false,
            hasMore: false,
            loadMore: vi.fn(async () => undefined),
            refetch: vi.fn(),
            pendingCount: 0,
            hasLoadedLatest: true,
            messagesVersion: 0,
            pendingReply: null,
            stream: null,
            streamVersion: 0,
            flushPending: vi.fn(),
            setAtBottom: vi.fn(),
        }
        useSessionMock.mockImplementation((_api: unknown, sessionId: string) => ({
            session: {
                ...sessionStateRef.current,
                id: sessionId
            },
            error: null,
            isPlaceholderData: false,
            hasWarmSnapshot: false,
            refetch: vi.fn(),
        }))
    })

    it('uses the route session id as the single session truth source', () => {
        const { rerender } = render(<SessionChatRoute />)

        expect(useSessionMock).toHaveBeenLastCalledWith(null, 'session-1')
        expect(sessionChatPropsMock.mock.lastCall?.[0]?.session.id).toBe('session-1')

        useParamsMock.mockReturnValue({ sessionId: 'session-2' })
        rerender(<SessionChatRoute />)

        expect(useSessionMock).toHaveBeenLastCalledWith(null, 'session-2')
        expect(sessionChatPropsMock.mock.lastCall?.[0]?.session.id).toBe('session-2')
        expect(useFinalizeBootShellMock).toHaveBeenLastCalledWith(true)
    })

    it('retains the previous stable chat surface until the next session is ready', () => {
        const { rerender } = render(<SessionChatRoute />)

        expect(sessionChatPropsMock.mock.lastCall?.[0]?.session.id).toBe('session-1')

        useParamsMock.mockReturnValue({ sessionId: 'session-2' })
        useSessionMock.mockImplementation((_api: unknown, sessionId: string) => ({
            session: createSession(sessionId),
            error: null,
            isPlaceholderData: true,
            hasWarmSnapshot: false,
            refetch: vi.fn(),
        }))
        routeHarness.messagesState = {
            ...routeHarness.messagesState,
            messages: [],
            hasLoadedLatest: false,
        }

        rerender(<SessionChatRoute />)

        expect(screen.getByTestId('retained-session-chat')).toBeInTheDocument()
        expect(sessionChatPropsMock.mock.lastCall?.[0]?.session.id).toBe('session-1')
        expect(useFinalizeBootShellMock).toHaveBeenLastCalledWith(undefined)

        useSessionMock.mockImplementation((_api: unknown, sessionId: string) => ({
            session: createSession(sessionId),
            error: null,
            isPlaceholderData: false,
            hasWarmSnapshot: false,
            refetch: vi.fn(),
        }))
        routeHarness.messagesState = {
            ...routeHarness.messagesState,
            hasLoadedLatest: true,
        }

        rerender(<SessionChatRoute />)

        expect(screen.queryByTestId('retained-session-chat')).toBeNull()
        expect(sessionChatPropsMock.mock.lastCall?.[0]?.session.id).toBe('session-2')
        expect(useFinalizeBootShellMock).toHaveBeenLastCalledWith(true)
    })

    it('writes the resumed snapshot in place instead of redirecting to another session route', async () => {
        render(<SessionChatRoute />)
        const onReady = resolverOptionsRef.current?.onReady

        expect(onReady).toBeTypeOf('function')

        await act(async () => {
            onReady?.({
                id: 'session-1',
                active: true
            })
            await Promise.resolve()
        })

        expect(navigateMock).not.toHaveBeenCalled()
        expect(setQueryDataMock).toHaveBeenCalled()
    })

    it('keeps explicit resume ownership out of the text send mutation options', () => {
        render(<SessionChatRoute />)

        expect(sendMessageOptionsMock).toHaveBeenCalled()
        expect(sendMessageOptionsMock.mock.lastCall?.[0]).toMatchObject({
            onBlocked: expect.any(Function),
            onSendStart: expect.any(Function),
            afterServerAccepted: expect.any(Function)
        })
        expect(sendMessageOptionsMock.mock.lastCall?.[0]).not.toHaveProperty('ensureSessionReady')
    })

    it('keeps rendering the chat shell when the current session comes from placeholder detail data', () => {
        useSessionMock.mockReturnValue({
            session: createSession('session-1'),
            error: null,
            isPlaceholderData: true,
            hasWarmSnapshot: false,
            refetch: vi.fn(),
        })

        render(<SessionChatRoute />)

        expect(sessionChatPropsMock.mock.lastCall?.[0]?.isDetailPending).toBe(true)
        expect(useFinalizeBootShellMock).toHaveBeenLastCalledWith(false)
    })

    it('uses the shared blocking fallback while the route session detail is still unresolved', () => {
        useSessionMock.mockReturnValue({
            session: null,
            error: null,
            isPlaceholderData: false,
            hasWarmSnapshot: false,
            refetch: vi.fn(),
        })

        const { getByTestId } = render(<SessionChatRoute />)

        expect(getByTestId('session-route-pending')).toHaveTextContent('session')
        expect(sessionChatPropsMock).not.toHaveBeenCalled()
        expect(useFinalizeBootShellMock).not.toHaveBeenCalled()
    })

    it('keeps the previous stable chat surface when the next route session is still unresolved', () => {
        const { rerender } = render(<SessionChatRoute />)

        expect(sessionChatPropsMock.mock.lastCall?.[0]?.session.id).toBe('session-1')

        useParamsMock.mockReturnValue({ sessionId: 'session-2' })
        useSessionMock.mockReturnValue({
            session: null,
            error: null,
            isPlaceholderData: false,
            hasWarmSnapshot: false,
            refetch: vi.fn(),
        })

        rerender(<SessionChatRoute />)

        expect(screen.getByTestId('retained-session-chat')).toBeInTheDocument()
        expect(sessionChatPropsMock.mock.lastCall?.[0]?.session.id).toBe('session-1')
    })

    it('traces when backend thinking becomes visible for a pending reply', () => {
        routeHarness.messagesState = {
            ...routeHarness.messagesState,
            pendingReply: {
                localId: 'local-1',
                requestStartedAt: 100,
                serverAcceptedAt: 120,
                phase: 'preparing'
            }
        }

        const { rerender } = render(<SessionChatRoute />)

        routeHarness.appendRealtimeTraceMock.mockClear()
        routeHarness.clearPendingReplyMock.mockClear()
        sessionStateRef.current = {
            ...sessionStateRef.current,
            thinking: true
        }
        rerender(<SessionChatRoute />)

        expect(routeHarness.appendRealtimeTraceMock).toHaveBeenCalledWith(expect.objectContaining({
            type: 'thinking_visible',
            details: expect.objectContaining({
                sessionId: 'session-1'
            })
        }))
        expect(routeHarness.clearPendingReplyMock).toHaveBeenCalledWith('session-1', 'local-1')
    })

    it('traces the first stream delta and clears the pending reply once streaming starts', () => {
        routeHarness.messagesState = {
            ...routeHarness.messagesState,
            pendingReply: {
                localId: 'local-1',
                requestStartedAt: 100,
                serverAcceptedAt: 120,
                phase: 'preparing'
            }
        }

        const { rerender } = render(<SessionChatRoute />)

        routeHarness.appendRealtimeTraceMock.mockClear()
        routeHarness.clearPendingReplyMock.mockClear()
        routeHarness.messagesState = {
            ...routeHarness.messagesState,
            stream: {
                streamId: 'stream-1',
                startedAt: 200,
                updatedAt: 210,
                text: 'H'
            },
            streamVersion: 1
        }
        rerender(<SessionChatRoute />)

        expect(routeHarness.appendRealtimeTraceMock).toHaveBeenCalledWith(expect.objectContaining({
            type: 'first_stream_delta',
            details: expect.objectContaining({
                sessionId: 'session-1',
                streamId: 'stream-1'
            })
        }))
        expect(routeHarness.clearPendingReplyMock).toHaveBeenCalledWith('session-1', 'local-1')
    })
})
