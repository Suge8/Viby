import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { VibyThread } from './VibyThread'

const useThreadViewportMock = vi.hoisted(() => vi.fn())

vi.mock('@assistant-ui/react', () => ({
    ThreadPrimitive: {
        Root: ({ children, className }: { children: React.ReactNode; className?: string }) => (
            <div data-testid="thread-root" className={className}>
                {children}
            </div>
        ),
        Viewport: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        Messages: () => <div data-testid="thread-messages" />
    }
}))

vi.mock('@/components/AssistantChat/useThreadViewport', () => ({
    useThreadViewport: useThreadViewportMock
}))

function renderThread(state?: Partial<Parameters<typeof VibyThread>[0]['state']>): ReturnType<typeof render> {
    return render(
        <I18nProvider>
            <VibyThread
                session={{
                    api: null as never,
                    sessionId: 'session-1',
                    metadata: null,
                    disabled: false,
                }}
                handlers={{
                    onRefresh: vi.fn(),
                    onRetryMessage: vi.fn(),
                    onFlushPending: vi.fn(),
                    onAtBottomChange: vi.fn(),
                    isLoadingMessages: false,
                    onLoadHistoryUntilPreviousUser: vi.fn(async () => ({ didLoadOlderMessages: true })),
                    onLoadMore: vi.fn(async () => ({ didLoadOlderMessages: true })),
                }}
                state={{
                    hasMoreMessages: false,
                    isLoadingMoreMessages: false,
                    isResponding: false,
                    hasStreamingResponse: false,
                    pendingCount: 0,
                    rawMessagesCount: 0,
                    normalizedMessagesCount: 0,
                    messagesVersion: 0,
                    streamVersion: 0,
                    threadMessageIds: [],
                    conversationMessageIds: [],
                    threadMessageOwnerById: new Map(),
                    historyJumpTargetMessageIds: [],
                    forceScrollToken: 0,
                    ...state
                }}
            />
        </I18nProvider>
    )
}

describe('VibyThread layout', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        useThreadViewportMock.mockReturnValue({
            viewportRef: { current: null },
            historyControlMode: 'jump-previous-user',
            isHistoryControlVisible: false,
            shouldReserveHistoryControlInset: false,
            isHistoryActionPending: false,
            isAtBottom: true,
            scrollToBottom: vi.fn(),
            handleHistoryControlClick: vi.fn()
        })
    })

    it('renders a centered full-width thread lane inside the stage shell', () => {
        const { container } = renderThread()

        expect(screen.getByTestId('thread-root')).toHaveClass('w-full')
        expect(screen.getByTestId('thread-root')).toHaveClass('flex-1')
        expect(screen.getByTestId('thread-root')).toHaveClass('min-w-0')
        expect(container.querySelector('.ds-thread-lane')).not.toBeNull()
        expect(container.querySelector('.viby-thread-messages')).toHaveClass('w-full')
    })

    it('renders the history control outside the scroll viewport when older messages are available', () => {
        useThreadViewportMock.mockReturnValue({
            viewportRef: { current: null },
            historyControlMode: 'load-more',
            isHistoryControlVisible: true,
            shouldReserveHistoryControlInset: true,
            isHistoryActionPending: false,
            isAtBottom: true,
            scrollToBottom: vi.fn(),
            handleHistoryControlClick: vi.fn()
        })
        const { container } = renderThread({
            hasMoreMessages: true,
            rawMessagesCount: 12,
            normalizedMessagesCount: 12,
            messagesVersion: 1,
            threadMessageIds: ['assistant:1', 'user:2'],
            conversationMessageIds: ['assistant:1', 'user:2'],
            threadMessageOwnerById: new Map([
                ['assistant:1', 'assistant:1'],
                ['user:2', 'user:2']
            ]),
            historyJumpTargetMessageIds: ['user:2']
        })

        const historyControl = screen.getByTestId('thread-history-control')
        expect(historyControl).toBeInTheDocument()
        expect(historyControl).toHaveTextContent('More messages')
        expect(container.querySelector('.session-chat-thread-viewport')?.contains(historyControl)).toBe(false)
        expect(container.querySelector('.ds-stage-shell')).toHaveClass('pt-14')
    })

    it('forces exact message layout measurement while a history transaction is pending', () => {
        useThreadViewportMock.mockReturnValue({
            viewportRef: { current: null },
            historyControlMode: 'jump-previous-user',
            isHistoryControlVisible: true,
            shouldReserveHistoryControlInset: true,
            isHistoryActionPending: true,
            isAtBottom: false,
            scrollToBottom: vi.fn(),
            handleHistoryControlClick: vi.fn()
        })

        const { container } = renderThread({
            rawMessagesCount: 2,
            normalizedMessagesCount: 2,
            messagesVersion: 1,
            threadMessageIds: ['user:1', 'assistant:2'],
            conversationMessageIds: ['user:1', 'assistant:2'],
            threadMessageOwnerById: new Map([
                ['user:1', 'user:1'],
                ['assistant:2', 'assistant:2']
            ]),
            historyJumpTargetMessageIds: ['user:1']
        })

        expect(container.querySelector('.viby-thread-messages')).toHaveAttribute('data-viby-measure-all', 'true')
    })

    it('keeps the top history inset even when the control itself is hidden', () => {
        useThreadViewportMock.mockReturnValue({
            viewportRef: { current: null },
            historyControlMode: 'load-more',
            isHistoryControlVisible: false,
            shouldReserveHistoryControlInset: true,
            isHistoryActionPending: false,
            isAtBottom: true,
            scrollToBottom: vi.fn(),
            handleHistoryControlClick: vi.fn()
        })
        const { container } = renderThread({
            rawMessagesCount: 2,
            normalizedMessagesCount: 2,
            messagesVersion: 1,
            threadMessageIds: ['user:1', 'user:2'],
            conversationMessageIds: ['user:1', 'user:2'],
            threadMessageOwnerById: new Map([
                ['user:1', 'user:1'],
                ['user:2', 'user:2']
            ]),
            historyJumpTargetMessageIds: ['user:1', 'user:2']
        })

        expect(screen.queryByTestId('thread-history-control')).not.toBeInTheDocument()
        expect(container.querySelector('.ds-stage-shell')).toHaveClass('pt-14')
    })

    it('renders a compact icon-only bottom CTA with an accessible label when the user is away from the bottom', () => {
        useThreadViewportMock.mockReturnValue({
            viewportRef: { current: null },
            historyControlMode: 'jump-previous-user',
            isHistoryControlVisible: false,
            shouldReserveHistoryControlInset: false,
            isHistoryActionPending: false,
            isAtBottom: false,
            scrollToBottom: vi.fn(),
            handleHistoryControlClick: vi.fn()
        })

        renderThread({
            rawMessagesCount: 2,
            normalizedMessagesCount: 2,
            messagesVersion: 1,
            threadMessageIds: ['user:1', 'assistant:2'],
            conversationMessageIds: ['user:1', 'assistant:2'],
            threadMessageOwnerById: new Map([
                ['user:1', 'user:1'],
                ['assistant:2', 'assistant:2']
            ])
        })

        const button = screen.getByRole('button', { name: 'Back to bottom' })
        const stage = button.closest('.ds-stage-shell')
        const wrapper = stage?.parentElement

        expect(button).toBeInTheDocument()
        expect(button).toHaveAttribute('title', 'Back to bottom')
        expect(button).toHaveClass('rounded-full')
        expect(stage).toHaveClass('justify-center')
        expect(stage).toHaveClass('ds-stage-shell')
        expect(wrapper).toHaveClass('inset-x-0')
        expect(wrapper).toHaveClass('z-30')
        expect(screen.queryByText('Back to bottom')).not.toBeInTheDocument()
    })

    it('keeps new-message semantics in the accessible label without rendering a visible badge or caption', () => {
        useThreadViewportMock.mockReturnValue({
            viewportRef: { current: null },
            historyControlMode: 'jump-previous-user',
            isHistoryControlVisible: false,
            shouldReserveHistoryControlInset: false,
            isHistoryActionPending: false,
            isAtBottom: false,
            scrollToBottom: vi.fn(),
            handleHistoryControlClick: vi.fn()
        })

        renderThread({
            pendingCount: 2,
            rawMessagesCount: 2,
            normalizedMessagesCount: 2,
            messagesVersion: 1,
            threadMessageIds: ['user:1', 'assistant:2'],
            conversationMessageIds: ['user:1', 'assistant:2'],
            threadMessageOwnerById: new Map([
                ['user:1', 'user:1'],
                ['assistant:2', 'assistant:2']
            ])
        })

        const button = screen.getByRole('button', { name: '2 new message{s}' })

        expect(button).toBeInTheDocument()
        expect(button).toHaveAttribute('title', '2 new message{s}')
        expect(screen.queryByText('2 new message{s}')).not.toBeInTheDocument()
    })

    it('renders a lightweight replying indicator inside the thread when thinking without streaming text', () => {
        renderThread({
            isResponding: true,
            rawMessagesCount: 2,
            normalizedMessagesCount: 2,
            messagesVersion: 1,
            threadMessageIds: ['assistant:1'],
            conversationMessageIds: ['assistant:1'],
            threadMessageOwnerById: new Map([
                ['assistant:1', 'assistant:1']
            ])
        })

        const indicator = screen.getByTestId('assistant-replying-indicator')
        const status = screen.getByRole('status')

        expect(indicator).toHaveTextContent('AI is replying')
        expect(indicator).toHaveClass('mx-auto')
        expect(status).toHaveClass('justify-center')
    })
})
