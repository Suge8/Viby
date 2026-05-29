import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, Fragment, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTINUE_GENERATION_PROMPT } from '@/chat/continueGeneration'
import { buildTranscriptRenderRows, injectThinkingRenderRow } from '@/chat/transcriptRenderRows'
import type { TranscriptRow } from '@/chat/transcriptTypes'
import { I18nProvider } from '@/lib/i18n-context'
import { NoticeProvider } from '@/lib/notice-center'
import {
    SESSION_CHAT_VIEWPORT_TEST_ID,
    THREAD_BOTTOM_CONTROL_TEST_ID,
    THREAD_HISTORY_LOADING_TEST_ID,
    THREAD_OUTLINE_POPOVER_TEST_ID,
    THREAD_OUTLINE_TRIGGER_TEST_ID,
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

type RenderThreadOverrides = {
    session?: Partial<Parameters<typeof VibyThread>[0]['session']>
    messageState?: Partial<Parameters<typeof VibyThread>[0]['messageState']>
    handlers?: Partial<Parameters<typeof VibyThread>[0]['handlers']>
    composerAnchorTop?: number
    replyingPhase?: Parameters<typeof VibyThread>[0]['replyingPhase']
}

function renderThread(overrides?: RenderThreadOverrides): ReturnType<typeof render> {
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
                        hasLoadedLatest: true,
                        hasMore: false,
                        isLoadingMore: false,
                        atBottom: true,
                        pendingCount: 0,
                        pendingReply: null,
                        messagesVersion: 1,
                        restoredFromWarmSnapshot: false,
                        stream: null,
                        ...overrides?.messageState,
                    }}
                    handlers={{
                        onRefresh: vi.fn(),
                        onRetryMessage: vi.fn(),
                        onSend: vi.fn(),
                        onFlushPending: vi.fn(),
                        onAtBottomChange: vi.fn(),
                        onLoadHistoryUntilPreviousUser: vi.fn(async () => ({ didLoadOlderMessages: true })),
                        ...overrides?.handlers,
                    }}
                    composerAnchorTop={overrides?.composerAnchorTop ?? 0}
                    replyingPhase={overrides?.replyingPhase ?? null}
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
        defaultItemHeight: 120,
        handleAtBottomStateChange: vi.fn(),
        handleTotalListHeightChanged: vi.fn(),
        handleStartReached: vi.fn(),
        handleRangeChanged: vi.fn(),
        handleViewportScrollCapture: vi.fn(),
        handleViewportWheelCapture: vi.fn(),
        handleViewportTouchStartCapture: vi.fn(),
        handleViewportTouchMoveCapture: vi.fn(),
        scrollToBottom: vi.fn(),
        scrollToConversation: vi.fn(() => true),
        ...overrides,
    }
}

function transcriptModelFromRows(rows: TranscriptRow[], options?: { outlineItems?: ConversationOutlineLite[] }) {
    const renderRows = buildTranscriptRenderRows(rows)
    return {
        rows,
        renderRows,
        freshRowIds: new Set<string>(),
        conversationIds: rows.map((row) => row.conversationId),
        rowStartIndexByConversationId: new Map(rows.map((row, index) => [row.conversationId, index])),
        rawMessagesCount: rows.length,
        normalizedMessagesCount: rows.length,
        outlineItems:
            options?.outlineItems ??
            rows
                .filter((row) => row.type === 'user')
                .map((row) => ({
                    conversationId: row.conversationId,
                    title: row.type === 'user' ? row.block.text : 'untitled',
                    createdAt: 0,
                })),
    }
}

type ConversationOutlineLite = { conversationId: string; title: string; createdAt: number }

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
        useSessionTranscriptModelMock.mockReturnValue(transcriptModelFromRows(transcriptRows))
        useTranscriptVirtuosoMock.mockReturnValue(createViewportMock())
    })

    it('renders a centered full-width thread lane inside the stage shell', () => {
        const { container } = renderThread()
        const threadLane = container.querySelector('.ds-thread-lane') as HTMLElement | null

        expect(container.querySelector('.session-chat-thread-root')).toHaveClass('w-full')
        expect(container.querySelector('.session-chat-thread-root')).toHaveClass('flex-1')
        expect(threadLane).not.toBeNull()
        expect(container.querySelector('.ds-thread-top-anchor-spacer')).not.toBeNull()
        expect(container.querySelector('.ds-thread-bottom-anchor-spacer')).not.toBeNull()
        expect(screen.getByTestId(SESSION_CHAT_VIEWPORT_TEST_ID)).toBeInTheDocument()
    })

    it('sends the canonical continue prompt from truncated terminal notices', () => {
        const onSend = vi.fn()
        useSessionTranscriptModelMock.mockReturnValue(
            transcriptModelFromRows([
                {
                    id: 'event:turn-terminal-1',
                    type: 'event',
                    conversationId: 'event:turn-terminal-1',
                    depth: 0,
                    copyText: null,
                    block: {
                        kind: 'agent-event',
                        id: 'turn-terminal-1',
                        createdAt: 1,
                        event: { type: 'turn-terminal', status: 'truncated', provider: 'pi', reason: 'length' },
                    },
                },
            ])
        )

        renderThread({ handlers: { onSend } })
        fireEvent.click(screen.getByRole('button', { name: 'chat.continueGeneration' }))

        expect(onSend).toHaveBeenCalledWith(CONTINUE_GENERATION_PROMPT)
    })

    it('holds the virtual transcript until the latest window is ready', () => {
        const { container } = renderThread({ messageState: { hasLoadedLatest: false } })

        expect(screen.queryByTestId(TRANSCRIPT_ROW_TEST_ID)).toBeNull()
        expect(container.querySelector('.ds-loading-shimmer')).not.toBeNull()
    })

    it('does not mount stale warm-snapshot transcript rows before recovery finishes', () => {
        const { container } = renderThread({ messageState: { restoredFromWarmSnapshot: true } })

        expect(screen.queryByTestId(TRANSCRIPT_ROW_TEST_ID)).toBeNull()
        expect(container.querySelector('.ds-loading-shimmer')).not.toBeNull()
    })

    it('marks the last visible row gap as none and tags user rows as history jump targets', () => {
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

        useSessionTranscriptModelMock.mockReturnValue(transcriptModelFromRows(transcriptRows))

        const { container } = renderThread()
        const rows = [...container.querySelectorAll<HTMLElement>('.ds-transcript-row')]

        expect(rows).toHaveLength(2)
        expect(rows[0]).toHaveAttribute('data-testid', TRANSCRIPT_ROW_TEST_ID)
        expect(rows[0]).toHaveAttribute('data-history-jump-target', 'true')
        expect(rows[1]).not.toHaveAttribute('data-history-jump-target')
        expect(rows[0]?.dataset.rowGap).not.toBe('none')
        expect(rows[1]?.dataset.rowGap).toBe('none')
    })

    it('hides the outline trigger when no user turns are present and no more history can be loaded', () => {
        // Outline navigates depth-0 user turns. With zero loaded turns AND no
        // more history available, there is genuinely nothing to jump to and
        // nothing to discover — the trigger stays hidden.
        const transcriptRows: TranscriptRow[] = []
        useSessionTranscriptModelMock.mockReturnValue(transcriptModelFromRows(transcriptRows))

        renderThread({ messageState: { hasMore: false } })

        expect(screen.queryByTestId(THREAD_OUTLINE_TRIGGER_TEST_ID)).toBeNull()
    })

    it('keeps the outline trigger mounted while latest history availability is still loading', () => {
        const transcriptRows: TranscriptRow[] = []
        useSessionTranscriptModelMock.mockReturnValue(transcriptModelFromRows(transcriptRows))

        renderThread({ messageState: { hasLoadedLatest: false, hasMore: false } })

        const trigger = screen.getByTestId(THREAD_OUTLINE_TRIGGER_TEST_ID)
        expect(trigger).toBeInTheDocument()
        expect(trigger).toBeDisabled()
        expect(trigger).toHaveAttribute('aria-busy', 'true')

        fireEvent.click(trigger)
        expect(screen.queryByTestId(THREAD_OUTLINE_POPOVER_TEST_ID)).toBeNull()
    })

    it('keeps the outline trigger mounted while a warm snapshot is being reconciled', () => {
        const transcriptRows: TranscriptRow[] = []
        useSessionTranscriptModelMock.mockReturnValue(transcriptModelFromRows(transcriptRows))

        renderThread({ messageState: { hasMore: false, restoredFromWarmSnapshot: true } })

        const trigger = screen.getByTestId(THREAD_OUTLINE_TRIGGER_TEST_ID)
        expect(trigger).toBeInTheDocument()
        expect(trigger).toBeDisabled()
    })

    it('keeps the outline trigger visible when no turns are loaded yet but older history is still available', () => {
        // Cold entry into a reasoning-heavy session can land with zero user turns
        // in the loaded 50-message window. Hiding the trigger then would silently
        // strand the user; instead the trigger stays visible so opening it can
        // pull older history via the shared single-flight loader.
        const transcriptRows: TranscriptRow[] = []
        useSessionTranscriptModelMock.mockReturnValue(transcriptModelFromRows(transcriptRows))

        renderThread({ messageState: { hasMore: true } })

        expect(screen.queryByTestId(THREAD_OUTLINE_TRIGGER_TEST_ID)).toBeInTheDocument()
    })

    it('renders the outline trigger floating above the composer when at least one user turn is available', () => {
        const transcriptRows: TranscriptRow[] = [
            {
                id: 'user:1',
                type: 'user',
                conversationId: 'user:1',
                depth: 0,
                copyText: 'first prompt',
                tone: 'user',
                block: {
                    kind: 'user-text',
                    id: 'u1',
                    localId: null,
                    createdAt: 1,
                    text: 'first prompt',
                    renderMode: 'plain',
                },
            },
        ]
        useSessionTranscriptModelMock.mockReturnValue(transcriptModelFromRows(transcriptRows))

        renderThread()

        const trigger = screen.getByTestId(THREAD_OUTLINE_TRIGGER_TEST_ID)
        expect(trigger).toBeInTheDocument()
        expect(trigger.closest('.ds-thread-outline-trigger-wrapper')).not.toBeNull()
    })

    it('opens the outline popover without pulling earlier history', async () => {
        const onLoad = vi.fn(async () => ({ didLoadOlderMessages: true }))
        const transcriptRows: TranscriptRow[] = [
            {
                id: 'user:1',
                type: 'user',
                conversationId: 'user:1',
                depth: 0,
                copyText: 'first prompt',
                tone: 'user',
                block: {
                    kind: 'user-text',
                    id: 'u1',
                    localId: null,
                    createdAt: 1,
                    text: 'first prompt',
                    renderMode: 'plain',
                },
            },
        ]
        useSessionTranscriptModelMock.mockReturnValue(transcriptModelFromRows(transcriptRows))

        renderThread({
            messageState: { hasMore: true, isLoadingMore: false },
            handlers: { onLoadHistoryUntilPreviousUser: onLoad },
        })

        fireEvent.click(screen.getByTestId(THREAD_OUTLINE_TRIGGER_TEST_ID))
        const popover = await screen.findByTestId(THREAD_OUTLINE_POPOVER_TEST_ID)
        expect(popover).toBeInTheDocument()
        expect(popover.textContent).toContain('first prompt')
        expect(onLoad).not.toHaveBeenCalled()
    })

    it('reveals loaded outline rows 5 at a time before requesting older history', async () => {
        const onLoad = vi.fn(async () => ({ didLoadOlderMessages: true }))
        const transcriptRows = Array.from({ length: 12 }, (_, index): TranscriptRow => {
            const ordinal = index + 1
            return {
                id: `user:${ordinal}`,
                type: 'user',
                conversationId: `user:${ordinal}`,
                depth: 0,
                copyText: `prompt ${ordinal}`,
                tone: 'user',
                block: {
                    kind: 'user-text',
                    id: `u${ordinal}`,
                    localId: null,
                    createdAt: ordinal,
                    text: `prompt ${ordinal}`,
                    renderMode: 'plain',
                },
            }
        })
        useSessionTranscriptModelMock.mockReturnValue(transcriptModelFromRows(transcriptRows))

        renderThread({
            messageState: { hasMore: true, isLoadingMore: false },
            handlers: { onLoadHistoryUntilPreviousUser: onLoad },
        })

        fireEvent.click(screen.getByTestId(THREAD_OUTLINE_TRIGGER_TEST_ID))
        const popover = await screen.findByTestId(THREAD_OUTLINE_POPOVER_TEST_ID)

        expect(popover.querySelectorAll('.ds-thread-outline-popover-item')).toHaveLength(5)
        expect(popover.textContent).not.toContain('prompt 7')
        expect(popover.textContent).toContain('prompt 8')
        expect(onLoad).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: /show earlier|显示更早/i }))
        expect(popover.querySelectorAll('.ds-thread-outline-popover-item')).toHaveLength(10)
        expect(popover.textContent).toContain('prompt 3')
        expect(onLoad).not.toHaveBeenCalled()
    })

    it('requests older history only from the explicit outline command', async () => {
        const onLoad = vi.fn(async () => ({ didLoadOlderMessages: true }))
        const transcriptRows: TranscriptRow[] = [
            {
                id: 'user:1',
                type: 'user',
                conversationId: 'user:1',
                depth: 0,
                copyText: 'first prompt',
                tone: 'user',
                block: {
                    kind: 'user-text',
                    id: 'u1',
                    localId: null,
                    createdAt: 1,
                    text: 'first prompt',
                    renderMode: 'plain',
                },
            },
        ]
        useSessionTranscriptModelMock.mockReturnValue(transcriptModelFromRows(transcriptRows))

        renderThread({
            messageState: { hasMore: true, isLoadingMore: false },
            handlers: { onLoadHistoryUntilPreviousUser: onLoad },
        })

        fireEvent.click(screen.getByTestId(THREAD_OUTLINE_TRIGGER_TEST_ID))
        await screen.findByTestId(THREAD_OUTLINE_POPOVER_TEST_ID)
        expect(onLoad).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: /show earlier|显示更早/i }))
        expect(onLoad).toHaveBeenCalledTimes(1)
    })

    it('does not render an outline more button when no more history is available', async () => {
        const onLoad = vi.fn(async () => ({ didLoadOlderMessages: false }))
        const transcriptRows: TranscriptRow[] = [
            {
                id: 'user:1',
                type: 'user',
                conversationId: 'user:1',
                depth: 0,
                copyText: 'first prompt',
                tone: 'user',
                block: {
                    kind: 'user-text',
                    id: 'u1',
                    localId: null,
                    createdAt: 1,
                    text: 'first prompt',
                    renderMode: 'plain',
                },
            },
        ]
        useSessionTranscriptModelMock.mockReturnValue(transcriptModelFromRows(transcriptRows))

        renderThread({
            messageState: { hasMore: false, isLoadingMore: false },
            handlers: { onLoadHistoryUntilPreviousUser: onLoad },
        })

        fireEvent.click(screen.getByTestId(THREAD_OUTLINE_TRIGGER_TEST_ID))
        await screen.findByTestId(THREAD_OUTLINE_POPOVER_TEST_ID)
        expect(screen.queryByRole('button', { name: /show earlier|显示更早/i })).toBeNull()
        expect(onLoad).not.toHaveBeenCalled()
    })

    it('renders a thinking row at the tail when a replyingPhase is active', () => {
        const transcriptRows: TranscriptRow[] = [
            {
                id: 'user:1',
                type: 'user',
                conversationId: 'user:1',
                depth: 0,
                copyText: 'hi',
                tone: 'user',
                block: {
                    kind: 'user-text',
                    id: 'u1',
                    localId: null,
                    createdAt: 1,
                    text: 'hi',
                    renderMode: 'plain',
                },
            },
        ]
        const baseRenderRows = buildTranscriptRenderRows(transcriptRows)
        useSessionTranscriptModelMock.mockReturnValue({
            rows: transcriptRows,
            renderRows: injectThinkingRenderRow(baseRenderRows, 'preparing'),
            freshRowIds: new Set<string>(),
            conversationIds: ['user:1'],
            rowStartIndexByConversationId: new Map([['user:1', 0]]),
            rawMessagesCount: 1,
            normalizedMessagesCount: 1,
            outlineItems: [{ conversationId: 'user:1', title: 'hi', createdAt: 0 }],
        })

        renderThread({ replyingPhase: 'preparing' })

        expect(screen.getByTestId('assistant-replying-indicator')).toBeInTheDocument()
    })

    it('keeps the transcript visible while loading the entry shell', () => {
        const { container } = renderThread({
            messageState: { pendingCount: 0 },
        })

        expect(container.querySelector('.session-chat-thread-viewport')).not.toHaveStyle({ visibility: 'hidden' })
        expect(container.querySelector('.ds-thread-top-anchor-spacer')).not.toBeNull()
    })

    it('forwards viewport wheel + scroll + touch capture to the single transcript owner', () => {
        const handleViewportWheelCapture = vi.fn()
        const handleViewportScrollCapture = vi.fn()
        const handleViewportTouchStartCapture = vi.fn()
        useTranscriptVirtuosoMock.mockReturnValue(
            createViewportMock({
                handleViewportWheelCapture,
                handleViewportScrollCapture,
                handleViewportTouchStartCapture,
            })
        )

        const { container } = renderThread()
        const viewport = container.querySelector('.session-chat-thread-viewport') as Element

        fireEvent.wheel(viewport, { deltaY: -120 })
        expect(handleViewportWheelCapture).toHaveBeenCalledTimes(1)

        fireEvent.scroll(viewport)
        expect(handleViewportScrollCapture).toHaveBeenCalledTimes(1)

        fireEvent.touchStart(viewport, { touches: [{ clientY: 180 }] })
        expect(handleViewportTouchStartCapture).toHaveBeenCalledTimes(1)
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
                            hasLoadedLatest: true,
                            hasMore: false,
                            isLoadingMore: false,
                            atBottom: false,
                            pendingCount: 1,
                            pendingReply: null,
                            messagesVersion: 2,
                            restoredFromWarmSnapshot: false,
                            stream: null,
                        }}
                        handlers={{
                            onRefresh: vi.fn(),
                            onRetryMessage: vi.fn(),
                            onSend: vi.fn(),
                            onFlushPending: vi.fn(),
                            onAtBottomChange: vi.fn(),
                            onLoadHistoryUntilPreviousUser: vi.fn(async () => ({ didLoadOlderMessages: true })),
                        }}
                        composerAnchorTop={0}
                        replyingPhase={null}
                    />
                </I18nProvider>
            </NoticeProvider>
        )

        expect(viewport.setViewportRef).toHaveBeenCalledTimes(initialCalls)
        expect(viewport.setViewportRef).not.toHaveBeenCalledWith(null)
    })

    it('renders a compact icon-only bottom CTA centered above the composer when the user is away from the bottom', () => {
        renderThread({ messageState: { atBottom: false } })

        const button = screen.getByRole('button', { name: 'Back to bottom' })
        const buttonAnchor = button.parentElement

        expect(button).toBeInTheDocument()
        expect(button).toHaveAttribute('title', 'Back to bottom')
        expect(buttonAnchor).toHaveClass('session-chat-thread-bottom-control-anchor')
        expect(buttonAnchor).toHaveClass('ds-thread-bottom-control-wrapper')
    })

    it('reveals the history loading indicator only while older messages are being fetched', () => {
        const view = renderThread({
            messageState: { hasMore: true, isLoadingMore: false },
        })

        const indicator = screen.getByTestId(THREAD_HISTORY_LOADING_TEST_ID)
        expect(indicator).toHaveAttribute('data-visible', 'false')

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
                            hasLoadedLatest: true,
                            hasMore: true,
                            isLoadingMore: true,
                            atBottom: false,
                            pendingCount: 0,
                            pendingReply: null,
                            messagesVersion: 1,
                            restoredFromWarmSnapshot: false,
                            stream: null,
                        }}
                        handlers={{
                            onRefresh: vi.fn(),
                            onRetryMessage: vi.fn(),
                            onSend: vi.fn(),
                            onFlushPending: vi.fn(),
                            onAtBottomChange: vi.fn(),
                            onLoadHistoryUntilPreviousUser: vi.fn(async () => ({ didLoadOlderMessages: true })),
                        }}
                        composerAnchorTop={0}
                        replyingPhase={null}
                    />
                </I18nProvider>
            </NoticeProvider>
        )

        expect(screen.getByTestId(THREAD_HISTORY_LOADING_TEST_ID)).toHaveAttribute('data-visible', 'true')
    })

    it('keeps the history loading indicator hidden when there is no more history to load', () => {
        renderThread({ messageState: { hasMore: false, isLoadingMore: true } })

        expect(screen.getByTestId(THREAD_HISTORY_LOADING_TEST_ID)).toHaveAttribute('data-visible', 'false')
    })

    it('hides the bottom CTA when the message-window atBottom owner reports we are at bottom', () => {
        renderThread({ messageState: { atBottom: true } })

        const button = screen.getByTestId(THREAD_BOTTOM_CONTROL_TEST_ID)
        expect(button).toHaveAttribute('aria-hidden', 'true')
        expect(button).toBeDisabled()
    })
})
