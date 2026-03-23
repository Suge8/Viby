import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SessionChatRoute from './chat'

const useParamsMock = vi.fn()
const navigateMock = vi.fn()
const useSessionMock = vi.fn()
const sessionChatPropsMock = vi.fn()
const addToastMock = vi.fn()
const resolverOptionsRef: {
    current: null | {
        onResolved: (currentSessionId: string, resolvedSessionId: string) => void
        onError: (error: unknown, currentSessionId: string) => void
    }
} = { current: null }

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({
        setQueryData: vi.fn(),
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
    useSendMessage: () => ({
        sendMessage: vi.fn(),
        retryMessage: vi.fn(),
        isSending: false,
    })
}))

vi.mock('@/hooks/queries/useMessages', () => ({
    useMessages: () => ({
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
        stream: null,
        streamVersion: 0,
        flushPending: vi.fn(),
        setAtBottom: vi.fn(),
    })
}))

vi.mock('@/hooks/queries/useSession', () => ({
    useSession: (...args: unknown[]) => useSessionMock(...args)
}))

vi.mock('@/hooks/queries/useSkills', () => ({
    useSkills: () => ({
        getSuggestions: vi.fn(async () => [])
    })
}))

vi.mock('@/hooks/queries/useSlashCommands', () => ({
    useSlashCommands: () => ({
        getSuggestions: vi.fn(async () => [])
    })
}))

vi.mock('@/hooks/useSessionTargetResolver', () => ({
    useSessionTargetResolver: (options: {
        onResolved: (currentSessionId: string, resolvedSessionId: string) => void
        onError: (error: unknown, currentSessionId: string) => void
    }) => {
        resolverOptionsRef.current = options
        return vi.fn(async (currentSessionId: string) => currentSessionId)
    }
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: null
    })
}))

vi.mock('@/lib/message-window-store', () => ({
    fetchLatestMessages: vi.fn(async () => undefined),
    getMessageWindowState: vi.fn(() => ({ messages: [] })),
    seedMessageWindowFromSession: vi.fn(),
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
    appendRealtimeTrace: vi.fn()
}))

vi.mock('@/lib/sendCatchup', () => ({
    runSendCatchup: vi.fn(async () => undefined)
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

describe('SessionChatRoute', () => {
    beforeEach(() => {
        useParamsMock.mockReturnValue({ sessionId: 'session-1' })
        navigateMock.mockReset()
        sessionChatPropsMock.mockReset()
        addToastMock.mockReset()
        resolverOptionsRef.current = null
        useSessionMock.mockImplementation((_api: unknown, sessionId: string) => ({
            session: createSession(sessionId),
            error: null,
            isPlaceholderData: false,
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
    })

    it('ignores a stale resume resolution after the user has already switched routes', async () => {
        const { rerender } = render(<SessionChatRoute />)
        const firstOnResolved = resolverOptionsRef.current?.onResolved

        expect(firstOnResolved).toBeTypeOf('function')

        useParamsMock.mockReturnValue({ sessionId: 'session-2' })
        rerender(<SessionChatRoute />)

        await act(async () => {
            firstOnResolved?.('session-1', 'session-3')
            await Promise.resolve()
        })

        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('keeps rendering the chat shell when the current session comes from placeholder detail data', () => {
        useSessionMock.mockReturnValue({
            session: createSession('session-1'),
            error: null,
            isPlaceholderData: true,
            refetch: vi.fn(),
        })

        render(<SessionChatRoute />)

        expect(sessionChatPropsMock.mock.lastCall?.[0]?.isDetailPending).toBe(true)
    })

    it('uses the shared blocking fallback while the route session detail is still unresolved', () => {
        useSessionMock.mockReturnValue({
            session: null,
            error: null,
            isPlaceholderData: false,
            refetch: vi.fn(),
        })

        const { getByTestId } = render(<SessionChatRoute />)

        expect(getByTestId('session-route-pending')).toHaveTextContent('session')
        expect(sessionChatPropsMock).not.toHaveBeenCalled()
    })
})
