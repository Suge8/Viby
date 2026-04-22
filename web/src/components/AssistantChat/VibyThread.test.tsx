import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement, Fragment, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTranscriptRenderRows } from '@/chat/transcriptRenderRows'
import type { TranscriptRow } from '@/chat/transcriptTypes'
import { I18nProvider } from '@/lib/i18n-context'
import { NoticeProvider } from '@/lib/notice-center'
import {
    SESSION_CHAT_VIEWPORT_TEST_ID,
    THREAD_BOTTOM_CONTROL_TEST_ID,
    TRANSCRIPT_ROW_TEST_ID,
} from '@/lib/sessionUiContracts'
import { VibyThread } from './VibyThread'

const useTranscriptVirtuosoMock = vi.hoisted(() => vi.fn())
const useSessionTranscriptModelMock = vi.hoisted(() => vi.fn())

vi.mock('react-virtuoso', () => ({
    Virtuoso: ({
        components,
        context,
        data,
        itemContent,
    }: {
        components?: {
            Header?: (props: { context?: unknown }) => ReactNode
            Footer?: (props: { context?: unknown }) => ReactNode
            Scroller?: (props: { children?: ReactNode; context?: unknown }) => ReactNode
            List?: (props: { children?: ReactNode; context?: unknown; style?: React.CSSProperties }) => ReactNode
        }
        context?: unknown
        data: unknown[]
        itemContent: (index: number, row: unknown) => ReactNode
    }) => {
        const renderedItems = data.map((row, index) =>
            createElement(Fragment, { key: `row-${index}` }, itemContent(index, row))
        )
        const header = components?.Header
            ? createElement(Fragment, { key: 'header' }, createElement(components.Header, { context }))
            : null
        const footer = components?.Footer
            ? createElement(Fragment, { key: 'footer' }, createElement(components.Footer, { context }))
            : null
        const list = components?.List ? (
            createElement(
                components.List,
                { context },
                [header, ...renderedItems, footer].filter(Boolean) as ReactNode[]
            )
        ) : (
            <div>
                {header}
                {renderedItems}
                {footer}
            </div>
        )
        return components?.Scroller ? (
            <>{createElement(components.Scroller, { context }, list)}</>
        ) : (
            <div data-testid="virtuoso-scroller">{list}</div>
        )
    },
}))

vi.mock('@/components/AssistantChat/useTranscriptVirtuoso', () => ({
    useTranscriptVirtuoso: useTranscriptVirtuosoMock,
}))

vi.mock('@/components/useSessionTranscriptModel', () => ({
    useSessionTranscriptModel: useSessionTranscriptModelMock,
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isTouch: false,
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
            selection: vi.fn(),
        },
    }),
}))

function renderThread(overrides?: {
    session?: Partial<Parameters<typeof VibyThread>[0]['session']>
    messageState?: Partial<Parameters<typeof VibyThread>[0]['messageState']>
    handlers?: Partial<Parameters<typeof VibyThread>[0]['handlers']>
    composerAnchorTop?: number
}): ReturnType<typeof render> {
    return render(
        <NoticeProvider>
            <I18nProvider>
                <VibyThread
                    session={{
                        api: null as never,
                        sessionId: 'session-1',
                        metadata: null,
                        agentState: null,
                        disabled: false,
                        ...overrides?.session,
                    }}
                    messageState={{
                        messages: [],
                        hasMore: false,
                        isLoading: false,
                        isLoadingMore: false,
                        atBottom: true,
                        pendingCount: 0,
                        pendingReply: null,
                        messagesVersion: 1,
                        stream: null,
                        ...overrides?.messageState,
                    }}
                    handlers={{
                        onRefresh: vi.fn(),
                        onRetryMessage: vi.fn(),
                        onFlushPending: vi.fn(),
                        onAtBottomChange: vi.fn(),
                        onLoadHistoryUntilPreviousUser: vi.fn(async () => ({ didLoadOlderMessages: true })),
                        ...overrides?.handlers,
                    }}
                    composerAnchorTop={overrides?.composerAnchorTop ?? 0}
                />
            </I18nProvider>
        </NoticeProvider>
    )
}

function createViewportMock(overrides?: Record<string, unknown>) {
    return {
        setViewportRef: vi.fn(),
        setVirtuosoRef: vi.fn(),
        viewportRef: { current: null },
        virtuosoRef: { current: null },
        firstItemIndex: 100000,
        initialTopMostItemIndex: { index: 17, align: 'end' } as const,
        alignToBottom: true,
        followOutput: vi.fn(),
        heightEstimates: [120],
        isHistoryActionPending: false,
        isHistoryControlVisible: false,
        handleHistoryControlClick: vi.fn(),
        handleRangeChanged: vi.fn(),
        handleAtBottomStateChange: vi.fn(),
        handleTotalListHeightChanged: vi.fn(),
        handleViewportScrollCapture: vi.fn(),
        handleViewportPointerDownCapture: vi.fn(),
        handleViewportWheelCapture: vi.fn(),
        handleViewportTouchStartCapture: vi.fn(),
        handleViewportTouchMoveCapture: vi.fn(),
        scrollToBottom: vi.fn(),
        ...overrides,
    }
}

describe('VibyThread layout', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        const transcriptRows: TranscriptRow[] = [
            {
                id: 'assistant:1',
                type: 'assistant-text',
                conversationId: 'assistant:1',
                depth: 0,
                copyText: 'hello',
                block: {
                    kind: 'agent-text',
                    id: '1',
                    localId: null,
                    createdAt: 1,
                    text: 'hello',
                    renderMode: 'plain',
                },
            },
        ]
        useSessionTranscriptModelMock.mockReturnValue({
            rows: transcriptRows,
            renderRows: buildTranscriptRenderRows(transcriptRows),
            conversationIds: ['assistant:1'],
            rowStartIndexByConversationId: new Map([['assistant:1', 0]]),
            historyJumpTargetConversationIds: [],
            rawMessagesCount: 1,
            normalizedMessagesCount: 1,
        })
        useTranscriptVirtuosoMock.mockReturnValue(createViewportMock())
    })

    it('renders a centered full-width thread lane inside the stage shell', () => {
        const { container } = renderThread()
        const threadLane = container.querySelector('.ds-thread-lane') as HTMLElement | null
        const topSpacer = container.querySelector('.ds-thread-top-anchor-spacer') as HTMLElement | null

        expect(container.querySelector('.session-chat-thread-root')).toHaveClass('w-full')
        expect(container.querySelector('.session-chat-thread-root')).toHaveClass('flex-1')
        expect(container.querySelector('.session-chat-thread-root')).toHaveClass('min-w-0')
        expect(container.querySelector('.session-chat-thread-viewport .ds-stage-shell')).not.toHaveClass(
            'pt-[var(--ds-session-chat-history-control-inset)]'
        )
        expect(threadLane).not.toBeNull()
        expect(topSpacer).not.toBeNull()
        expect(topSpacer?.style.height).toBe('var(--chat-header-anchor-space)')
        const bottomSpacer = container.querySelector('.ds-thread-bottom-anchor-spacer') as HTMLElement | null
        expect(bottomSpacer?.style.height).toBe('var(--chat-composer-occupied-space)')
        expect(container.querySelector('.session-chat-thread-viewport')).not.toBeNull()
        expect(screen.getByTestId(SESSION_CHAT_VIEWPORT_TEST_ID)).toBeInTheDocument()
    })

    it('keeps the transcript tail gap owned by the composer clearance instead of the last row spacing', () => {
        const transcriptRows: TranscriptRow[] = [
            {
                id: 'user:1',
                type: 'user',
                conversationId: 'user:1',
                depth: 0,
                copyText: 'hello',
                tone: 'user',
                block: {
                    kind: 'user-text',
                    id: 'u1',
                    localId: null,
                    createdAt: 1,
                    text: 'hello',
                    renderMode: 'plain',
                },
            },
            {
                id: 'assistant:2',
                type: 'assistant-text',
                conversationId: 'assistant:2',
                depth: 0,
                copyText: 'world',
                block: {
                    kind: 'agent-text',
                    id: 'a2',
                    localId: null,
                    createdAt: 2,
                    text: 'world',
                    renderMode: 'plain',
                },
            },
        ]

        useSessionTranscriptModelMock.mockReturnValue({
            rows: transcriptRows,
            renderRows: buildTranscriptRenderRows(transcriptRows),
            conversationIds: ['user:1', 'assistant:2'],
            rowStartIndexByConversationId: new Map([
                ['user:1', 0],
                ['assistant:2', 1],
            ]),
            historyJumpTargetConversationIds: ['user:1'],
            rawMessagesCount: 2,
            normalizedMessagesCount: 2,
        })

        const { container } = renderThread()
        const rows = [...container.querySelectorAll<HTMLElement>('.ds-transcript-row')]

        expect(rows).toHaveLength(2)
        expect(rows[0]).toHaveAttribute('data-testid', TRANSCRIPT_ROW_TEST_ID)
        expect(rows[0]).toHaveAttribute('data-history-jump-target', 'true')
        expect(rows[1]).not.toHaveAttribute('data-history-jump-target')
        expect(rows[0]?.dataset.rowGap).not.toBe('none')
        expect(rows[1]?.dataset.rowGap).toBe('none')
    })

    it('only reserves top inset when the history control is visible', () => {
        useTranscriptVirtuosoMock.mockReturnValue(createViewportMock({ isHistoryControlVisible: true }))

        const { container } = renderThread({
            messageState: {
                hasMore: true,
            },
        })

        expect(container.querySelector('.session-chat-thread-viewport .ds-stage-shell')).toHaveClass(
            'pt-[var(--ds-session-chat-history-control-inset)]'
        )
    })

    it('renders the history control outside the scroll viewport when older messages are available', () => {
        useTranscriptVirtuosoMock.mockReturnValue(createViewportMock({ isHistoryControlVisible: true }))

        const { container } = renderThread({
            messageState: {
                hasMore: true,
            },
        })

        const historyControl = screen.getByTestId('thread-history-control')
        const historyAnchor = historyControl.parentElement

        expect(historyControl).toBeInTheDocument()
        expect(historyControl).toHaveAttribute('title', 'misc.previousUserMessage')
        expect(historyAnchor).toHaveClass('ds-thread-history-control-wrapper')
        expect(container.querySelector('.session-chat-thread-viewport')?.contains(historyControl)).toBe(false)
    })

    it('keeps the transcript visible while loading the entry shell', () => {
        const { container } = renderThread({
            messageState: {
                isLoading: true,
                pendingCount: 0,
            },
        })

        expect(container.querySelector('.session-chat-thread-viewport')).not.toHaveStyle({ visibility: 'hidden' })
        expect(container.querySelector('.ds-thread-top-anchor-spacer')).not.toBeNull()
        expect(screen.getByTestId('thread-history-control')).toHaveAttribute('aria-hidden', 'true')
        expect(screen.getByTestId('thread-history-control')).toBeDisabled()
    })

    it('marks wheel-driven leave-bottom intent immediately on the viewport owner', () => {
        const handleViewportWheelCapture = vi.fn()
        useTranscriptVirtuosoMock.mockReturnValue(createViewportMock({ handleViewportWheelCapture }))

        const { container } = renderThread()
        const viewport = container.querySelector('.session-chat-thread-viewport')

        expect(viewport).not.toBeNull()
        fireEvent.wheel(viewport as Element, { deltaY: -120 })
        expect(handleViewportWheelCapture).toHaveBeenCalledTimes(1)
    })

    it('forwards viewport scroll capture to the single transcript owner', () => {
        const handleViewportScrollCapture = vi.fn()
        useTranscriptVirtuosoMock.mockReturnValue(createViewportMock({ handleViewportScrollCapture }))

        const { container } = renderThread()
        const viewport = container.querySelector('.session-chat-thread-viewport')

        expect(viewport).not.toBeNull()
        fireEvent.scroll(viewport as Element)
        expect(handleViewportScrollCapture).toHaveBeenCalledTimes(1)
    })

    it('ignores descendant scroll events so nested scrollers cannot steal the viewport owner', () => {
        const handleViewportScrollCapture = vi.fn()
        useTranscriptVirtuosoMock.mockReturnValue(createViewportMock({ handleViewportScrollCapture }))

        const { container } = renderThread()
        const firstRow = container.querySelector('.ds-transcript-row')

        expect(firstRow).not.toBeNull()
        fireEvent.scroll(firstRow as Element)
        expect(handleViewportScrollCapture).not.toHaveBeenCalled()
    })

    it('marks touch-start leave-bottom intent immediately on mobile viewport drags', () => {
        const handleViewportTouchStartCapture = vi.fn()
        useTranscriptVirtuosoMock.mockReturnValue(createViewportMock({ handleViewportTouchStartCapture }))

        const { container } = renderThread()
        const viewport = container.querySelector('.session-chat-thread-viewport')

        expect(viewport).not.toBeNull()
        fireEvent.touchStart(viewport as Element, { touches: [{ clientY: 180 }] })
        expect(handleViewportTouchStartCapture).toHaveBeenCalledTimes(1)
    })

    it('does not detach and reattach the viewport ref on unrelated rerenders', () => {
        const viewport = createViewportMock()
        useTranscriptVirtuosoMock.mockReturnValue(viewport)

        const view = renderThread()
        const initialCalls = viewport.setViewportRef.mock.calls.length

        view.rerender(
            <NoticeProvider>
                <I18nProvider>
                    <VibyThread
                        session={{
                            api: null as never,
                            sessionId: 'session-1',
                            metadata: null,
                            agentState: null,
                            disabled: false,
                        }}
                        messageState={{
                            messages: [],
                            hasMore: false,
                            isLoading: false,
                            isLoadingMore: false,
                            atBottom: false,
                            pendingCount: 1,
                            pendingReply: null,
                            messagesVersion: 2,
                            stream: null,
                        }}
                        handlers={{
                            onRefresh: vi.fn(),
                            onRetryMessage: vi.fn(),
                            onFlushPending: vi.fn(),
                            onAtBottomChange: vi.fn(),
                            onLoadHistoryUntilPreviousUser: vi.fn(async () => ({ didLoadOlderMessages: true })),
                        }}
                        composerAnchorTop={0}
                    />
                </I18nProvider>
            </NoticeProvider>
        )

        expect(viewport.setViewportRef).toHaveBeenCalledTimes(initialCalls)
        expect(viewport.setViewportRef).not.toHaveBeenCalledWith(null)
    })

    it('renders a compact icon-only bottom CTA with an accessible label when the user is away from the bottom', () => {
        useTranscriptVirtuosoMock.mockReturnValue(createViewportMock({ scrollToBottom: vi.fn() }))

        renderThread({
            messageState: {
                atBottom: false,
            },
        })

        const button = screen.getByRole('button', { name: 'Back to bottom' })
        const buttonAnchor = button.parentElement

        expect(button).toBeInTheDocument()
        expect(button).toHaveAttribute('title', 'Back to bottom')
        expect(buttonAnchor).toHaveClass('session-chat-thread-bottom-control-anchor')
        expect(buttonAnchor).toHaveClass('ds-thread-bottom-control-wrapper')
    })

    it('uses the message-window atBottom owner for the bottom CTA', () => {
        const { container } = renderThread({
            messageState: {
                atBottom: true,
            },
        })

        const button = screen.getByTestId(THREAD_BOTTOM_CONTROL_TEST_ID)
        expect(button).not.toBeNull()
        expect(button).toHaveAttribute('aria-hidden', 'true')
        expect(button).toBeDisabled()
    })
})
