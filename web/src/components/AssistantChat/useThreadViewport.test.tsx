import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THREAD_MESSAGE_ID_ATTRIBUTE } from '@/components/AssistantChat/threadMessageIdentity'
import type { LoadMoreMessagesResult } from '@/lib/message-window-store'
import { useThreadViewport } from './useThreadViewport'

type AnchorSpec = {
    id: string
    top: number
    height?: number
}

type HarnessProps = {
    sessionId?: string
    hasMoreMessages?: boolean
    isLoadingMoreMessages?: boolean
    messagesVersion?: number
    streamVersion?: number
    forceScrollToken?: number
    pinToBottomOnSessionEntry?: boolean
    orderedMessageIds?: readonly string[]
    renderedMessageIds?: readonly string[]
    conversationMessageIds?: readonly string[]
    historyJumpTargetMessageIds?: readonly string[]
    onLoadHistoryUntilPreviousUser?: () => Promise<LoadMoreMessagesResult>
    onLoadMore?: () => Promise<LoadMoreMessagesResult>
}

const defaultLoadMore = async (): Promise<LoadMoreMessagesResult> => ({ didLoadOlderMessages: true })
const defaultLoadHistoryUntilPreviousUser = async (): Promise<LoadMoreMessagesResult> => ({ didLoadOlderMessages: true })

function createDeferredLoadMore(): {
    promise: Promise<Readonly<{ didLoadOlderMessages: boolean }>>
    resolve: (value?: Readonly<{ didLoadOlderMessages: boolean }>) => void
} {
    let resolvePromise!: (value: Readonly<{ didLoadOlderMessages: boolean }>) => void

    return {
        promise: new Promise((resolve) => {
            resolvePromise = resolve
        }),
        resolve(value = { didLoadOlderMessages: true }) {
            resolvePromise(value)
        }
    }
}

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
const originalResizeObserver = globalThis.ResizeObserver
const originalMutationObserver = globalThis.MutationObserver
const activeViewportGeometry = {
    current: null as null | {
        viewport: HTMLDivElement
        viewportTop: number
        clientHeight: number
        getScrollTop: () => number
        anchors: Map<string, AnchorSpec>
    }
}
const activeResizeObserverCallbacks = new Set<ResizeObserverCallback>()
const activeMutationObserverCallbacks = new Set<MutationCallback>()

let scrollIntoViewMock: ReturnType<typeof vi.fn>

function triggerResizeObservers(): void {
    for (const callback of Array.from(activeResizeObserverCallbacks)) {
        callback([], {} as ResizeObserver)
    }
}

function triggerMutationObservers(): void {
    for (const callback of Array.from(activeMutationObserverCallbacks)) {
        callback([], {} as MutationObserver)
    }
}

function fireUserScroll(viewport: HTMLDivElement, nextScrollTop?: number): void {
    if (typeof nextScrollTop === 'number') {
        viewport.scrollTop = nextScrollTop
    }
    fireEvent.wheel(viewport)
    fireEvent.scroll(viewport)
}

function decorateViewport(viewport: HTMLDivElement, metrics: {
    clientHeight: number
    scrollHeight: number
    initialScrollTop?: number
}) {
    const viewportTop = 100
    let scrollTop = metrics.initialScrollTop ?? 0
    let scrollHeight = metrics.scrollHeight
    const scrollTopWrites: number[] = []

    Object.defineProperty(viewport, 'clientHeight', {
        configurable: true,
        value: metrics.clientHeight
    })
    Object.defineProperty(viewport, 'scrollHeight', {
        configurable: true,
        get: () => scrollHeight,
        set: (value: number) => {
            scrollHeight = value
        }
    })
    Object.defineProperty(viewport, 'scrollTop', {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
            scrollTop = value
            scrollTopWrites.push(value)
        }
    })

    const scrollToMock = vi.fn((...args: [ScrollToOptions?] | [number, number]) => {
        const [optionsOrX, y] = args

        if (typeof optionsOrX === 'number') {
            scrollTop = y ?? scrollTop
            return
        }

        scrollTop = optionsOrX?.top ?? scrollTop
    })

    Object.defineProperty(viewport, 'scrollTo', {
        configurable: true,
        value: scrollToMock as HTMLDivElement['scrollTo']
    })
    Object.defineProperty(viewport, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            x: 0,
            y: viewportTop,
            top: viewportTop,
            bottom: viewportTop + metrics.clientHeight,
            left: 0,
            right: 320,
            width: 320,
            height: metrics.clientHeight,
            toJSON: () => ({})
        })
    })

    function setAnchors(anchors: AnchorSpec[]): void {
        const geometry = activeViewportGeometry.current
        if (!geometry) {
            return
        }

        geometry.anchors = new Map(anchors.map((anchor) => [anchor.id, anchor]))
    }

    activeViewportGeometry.current = {
        viewport,
        viewportTop,
        clientHeight: metrics.clientHeight,
        getScrollTop: () => scrollTop,
        anchors: new Map()
    }

    return {
        scrollToMock,
        setAnchors,
        setScrollHeight(nextScrollHeight: number) {
            scrollHeight = nextScrollHeight
        },
        getScrollTop() {
            return scrollTop
        },
        getScrollTopWrites() {
            return [...scrollTopWrites]
        },
        clearScrollTopWrites() {
            scrollTopWrites.length = 0
        }
    }
}

function Harness(props: HarnessProps): React.JSX.Element {
    const hook = useThreadViewport({
        sessionId: props.sessionId ?? 'session-1',
        hasMoreMessages: props.hasMoreMessages ?? true,
        isLoadingMessages: false,
        isLoadingMoreMessages: props.isLoadingMoreMessages ?? false,
        onLoadHistoryUntilPreviousUser: props.onLoadHistoryUntilPreviousUser ?? defaultLoadHistoryUntilPreviousUser,
        onLoadMore: props.onLoadMore ?? defaultLoadMore,
        onAtBottomChange: vi.fn(),
        onFlushPending: vi.fn(),
        messagesVersion: props.messagesVersion ?? 0,
        streamVersion: props.streamVersion ?? 0,
        orderedMessageIds: props.orderedMessageIds ?? [],
        conversationMessageIds: props.conversationMessageIds ?? props.orderedMessageIds ?? [],
        threadMessageOwnerById: new Map((props.orderedMessageIds ?? []).map((messageId) => [messageId, messageId])),
        historyJumpTargetMessageIds: props.historyJumpTargetMessageIds ?? [],
        forceScrollToken: props.forceScrollToken ?? 0,
        pinToBottomOnSessionEntry: props.pinToBottomOnSessionEntry ?? false,
    })

    return (
        <>
            <div ref={hook.viewportRef} data-testid="viewport">
                <div data-testid="content-root">
                    {(props.renderedMessageIds ?? props.orderedMessageIds ?? []).map((messageId) => (
                        <div key={messageId} data-viby-thread-message-id={messageId} />
                    ))}
                </div>
            </div>
            <button type="button" data-testid="history-control" onClick={hook.handleHistoryControlClick}>
                history
            </button>
            <output data-testid="history-visible">{String(hook.isHistoryControlVisible)}</output>
            <output data-testid="history-inset">{String(hook.shouldReserveHistoryControlInset)}</output>
            <output data-testid="at-bottom">{String(hook.isAtBottom)}</output>
        </>
    )
}

describe('useThreadViewport', () => {
    beforeEach(() => {
        scrollIntoViewMock = vi.fn(function(this: HTMLElement, _options?: ScrollIntoViewOptions) {
            const geometry = activeViewportGeometry.current
            if (!geometry) {
                return
            }

            const messageId = this.getAttribute(THREAD_MESSAGE_ID_ATTRIBUTE)
            if (!messageId) {
                return
            }

            const anchor = geometry.anchors.get(messageId)
            if (!anchor) {
                return
            }

            geometry.viewport.scrollTop = anchor.top
        })
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoViewMock
        })
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            writable: true,
            value: vi.fn((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }))
        })
        class ResizeObserverMock {
            private readonly callback: ResizeObserverCallback

            constructor(callback: ResizeObserverCallback) {
                this.callback = callback
                activeResizeObserverCallbacks.add(callback)
            }

            observe = vi.fn()
            disconnect = vi.fn(() => {
                activeResizeObserverCallbacks.delete(this.callback)
            })
            unobserve = vi.fn()
        }
        class MutationObserverMock {
            private readonly callback: MutationCallback

            constructor(callback: MutationCallback) {
                this.callback = callback
                activeMutationObserverCallbacks.add(callback)
            }

            observe = vi.fn()
            disconnect = vi.fn(() => {
                activeMutationObserverCallbacks.delete(this.callback)
            })
            takeRecords = vi.fn(() => [])
        }
        Object.defineProperty(globalThis, 'ResizeObserver', {
            configurable: true,
            writable: true,
            value: ResizeObserverMock
        })
        Object.defineProperty(globalThis, 'MutationObserver', {
            configurable: true,
            writable: true,
            value: MutationObserverMock
        })
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
            const geometry = activeViewportGeometry.current
            if (geometry) {
                const messageId = this.getAttribute(THREAD_MESSAGE_ID_ATTRIBUTE)
                if (messageId) {
                    const anchor = geometry.anchors.get(messageId)
                    if (anchor) {
                        const top = geometry.viewportTop + anchor.top - geometry.getScrollTop()
                        const height = anchor.height ?? 80

                        return {
                            x: 0,
                            y: top,
                            top,
                            bottom: top + height,
                            left: 0,
                            right: 320,
                            width: 320,
                            height,
                            toJSON: () => ({})
                        }
                    }
                }
            }

            return originalGetBoundingClientRect.call(this)
        })
    })

    afterEach(() => {
        cleanup()
        activeViewportGeometry.current = null
        activeResizeObserverCallbacks.clear()
        activeMutationObserverCallbacks.clear()
        vi.restoreAllMocks()
        if (originalScrollIntoView) {
            Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
                configurable: true,
                value: originalScrollIntoView
            })
        } else {
            delete (HTMLElement.prototype as { scrollIntoView?: typeof HTMLElement.prototype.scrollIntoView }).scrollIntoView
        }
        if (originalResizeObserver) {
            Object.defineProperty(globalThis, 'ResizeObserver', {
                configurable: true,
                writable: true,
                value: originalResizeObserver
            })
        } else {
            delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
        }
        if (originalMutationObserver) {
            Object.defineProperty(globalThis, 'MutationObserver', {
                configurable: true,
                writable: true,
                value: originalMutationObserver
            })
        } else {
            delete (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver
        }
    })

    it('jumps to the previous loaded user message when away from the history boundary', () => {
        render(
            <Harness
                orderedMessageIds={['user:1', 'assistant:2', 'user:3', 'assistant:4', 'assistant:5']}
                historyJumpTargetMessageIds={['user:1', 'user:3']}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 760,
            initialScrollTop: 360
        })
        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 120 },
            { id: 'user:3', top: 240 },
            { id: 'assistant:4', top: 360 },
            { id: 'assistant:5', top: 520 }
        ])

        act(() => {
            fireUserScroll(viewport, 360)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        expect(scrollIntoViewMock).not.toHaveBeenCalled()
        expect(model.getScrollTop()).toBe(240)
    })

    it('recomputes the previous user target from the live viewport geometry on click', () => {
        render(
            <Harness
                orderedMessageIds={['user:1', 'assistant:2', 'user:3', 'assistant:4', 'assistant:5']}
                historyJumpTargetMessageIds={['user:1', 'user:3']}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 920,
            initialScrollTop: 360
        })
        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 120 },
            { id: 'user:3', top: 240 },
            { id: 'assistant:4', top: 360 },
            { id: 'assistant:5', top: 520 }
        ])

        act(() => {
            fireUserScroll(viewport, 360)
        })

        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 260 },
            { id: 'user:3', top: 400 },
            { id: 'assistant:4', top: 600 },
            { id: 'assistant:5', top: 760 }
        ])

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        expect(scrollIntoViewMock).not.toHaveBeenCalled()
        expect(model.getScrollTop()).toBe(0)
    })

    it('chooses the anchor closest to the viewport top instead of a giant earlier wrapper', () => {
        render(
            <Harness
                orderedMessageIds={['user:1', 'tool:a', 'user:2', 'tool:b']}
                historyJumpTargetMessageIds={['user:1', 'user:2']}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 1200,
            initialScrollTop: 700
        })
        model.setAnchors([
            { id: 'user:1', top: 0, height: 80 },
            { id: 'tool:a', top: 100, height: 900 },
            { id: 'user:2', top: 620, height: 60 },
            { id: 'tool:b', top: 700, height: 80 }
        ])

        act(() => {
            fireUserScroll(viewport, 700)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        expect(scrollIntoViewMock).not.toHaveBeenCalled()
        expect(model.getScrollTop()).toBe(620)
    })

    it('starts a short alignment transaction when jumping to a loaded previous user target', () => {
        const frameQueue: FrameRequestCallback[] = []
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            frameQueue.push(callback)
            return frameQueue.length
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId: number) => {
            frameQueue.splice(frameId - 1, 1)
        })

        render(
            <Harness
                orderedMessageIds={['user:1', 'assistant:2', 'user:3', 'assistant:4']}
                historyJumpTargetMessageIds={['user:1', 'user:3']}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 760,
            initialScrollTop: 360
        })
        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 120 },
            { id: 'user:3', top: 240 },
            { id: 'assistant:4', top: 360 }
        ])

        act(() => {
            fireUserScroll(viewport, 360)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        expect(model.getScrollTop()).toBe(240)
        expect(frameQueue).toHaveLength(1)

        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 120 },
            { id: 'user:3', top: 360 },
            { id: 'assistant:4', top: 480 }
        ])

        expect(scrollIntoViewMock).not.toHaveBeenCalled()
        expect(model.getScrollTop()).toBe(240)
    })

    it('keeps a loaded previous user target aligned while the thread keeps resizing afterwards', () => {
        const frameQueue: FrameRequestCallback[] = []
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            frameQueue.push(callback)
            return frameQueue.length
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId: number) => {
            frameQueue.splice(frameId - 1, 1)
        })

        render(
            <Harness
                orderedMessageIds={['user:1', 'assistant:2', 'user:3', 'assistant:4']}
                historyJumpTargetMessageIds={['user:1', 'user:3']}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 960,
            initialScrollTop: 360
        })
        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 120 },
            { id: 'user:3', top: 240 },
            { id: 'assistant:4', top: 360 }
        ])

        act(() => {
            fireUserScroll(viewport, 360)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        expect(model.getScrollTop()).toBe(240)
        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(16)
            }
        })

        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 120 },
            { id: 'user:3', top: 540 },
            { id: 'assistant:4', top: 660 }
        ])

        act(() => {
            triggerResizeObservers()
        })

        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(32)
            }
        })

        expect(scrollIntoViewMock).not.toHaveBeenCalled()
        expect(model.getScrollTop()).toBe(540)
    })

    it('ignores follow-up history clicks while a loaded previous-user jump is still settling', () => {
        const frameQueue: FrameRequestCallback[] = []
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            frameQueue.push(callback)
            return frameQueue.length
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId: number) => {
            frameQueue.splice(frameId - 1, 1)
        })
        const onLoadMore = vi.fn(defaultLoadMore)

        render(
            <Harness
                onLoadMore={onLoadMore}
                orderedMessageIds={['user:1', 'assistant:2', 'user:3', 'assistant:4']}
                historyJumpTargetMessageIds={['user:1', 'user:3']}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 640,
            initialScrollTop: 240
        })
        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 40 },
            { id: 'user:3', top: 80 },
            { id: 'assistant:4', top: 240 }
        ])

        act(() => {
            fireUserScroll(viewport, 240)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        expect(model.getScrollTop()).toBe(80)
        expect(frameQueue).toHaveLength(1)

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        expect(onLoadMore).not.toHaveBeenCalled()
        expect(model.getScrollTop()).toBe(80)
    })

    it('keeps the loaded previous-user lock until the layout stays quiet after the last late resize', async () => {
        vi.useFakeTimers()
        try {
            const frameQueue: FrameRequestCallback[] = []
            vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
                frameQueue.push(callback)
                return frameQueue.length
            })
            vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId: number) => {
                frameQueue.splice(frameId - 1, 1)
            })
            const onLoadMore = vi.fn(defaultLoadMore)

            render(
                <Harness
                    onLoadMore={onLoadMore}
                    orderedMessageIds={['user:1', 'assistant:2', 'user:3', 'assistant:4']}
                    historyJumpTargetMessageIds={['user:1', 'user:3']}
                />
            )

            const viewport = screen.getByTestId('viewport') as HTMLDivElement
            const model = decorateViewport(viewport, {
                clientHeight: 220,
                scrollHeight: 640,
                initialScrollTop: 240
            })
            model.setAnchors([
                { id: 'user:1', top: 0 },
                { id: 'assistant:2', top: 40 },
                { id: 'user:3', top: 80 },
                { id: 'assistant:4', top: 240 }
            ])

            act(() => {
                fireUserScroll(viewport, 240)
            })

            act(() => {
                fireEvent.click(screen.getByTestId('history-control'))
            })

            expect(model.getScrollTop()).toBe(80)

            act(() => {
                vi.advanceTimersByTime(450)
            })

            model.setAnchors([
                { id: 'user:1', top: 0 },
                { id: 'assistant:2', top: 40 },
                { id: 'user:3', top: 140 },
                { id: 'assistant:4', top: 300 }
            ])

            act(() => {
                triggerResizeObservers()
            })

            expect(frameQueue).toHaveLength(1)

            act(() => {
                const nextFrame = frameQueue.shift()
                if (nextFrame) {
                    nextFrame(16)
                }
            })

            expect(model.getScrollTop()).toBe(140)

            act(() => {
                vi.advanceTimersByTime(60)
                fireEvent.click(screen.getByTestId('history-control'))
            })

            expect(onLoadMore).not.toHaveBeenCalled()

            await act(async () => {
                vi.advanceTimersByTime(500)
                fireEvent.click(screen.getByTestId('history-control'))
                await Promise.resolve()
            })

            expect(onLoadMore).not.toHaveBeenCalled()
            expect(model.getScrollTop()).toBe(0)
        } finally {
            vi.useRealTimers()
        }
    })

    it('jumps to the previous loaded user message even if the viewport is scrolled inside the current one', () => {
        render(
            <Harness
                orderedMessageIds={['user:1', 'assistant:2', 'user:3', 'assistant:4']}
                historyJumpTargetMessageIds={['user:1', 'user:3']}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 1320,
            initialScrollTop: 520
        })
        model.setAnchors([
            { id: 'user:1', top: 0, height: 80 },
            { id: 'assistant:2', top: 120, height: 80 },
            { id: 'user:3', top: 240, height: 720 },
            { id: 'assistant:4', top: 1000, height: 80 }
        ])

        act(() => {
            fireUserScroll(viewport, 520)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        expect(scrollIntoViewMock).not.toHaveBeenCalled()
        expect(model.getScrollTop()).toBe(0)
    })

    it('keeps the viewport still while hidden previous-user history is loading', () => {
        const deferred = createDeferredLoadMore()
        const onLoadHistoryUntilPreviousUser = vi.fn(() => deferred.promise)
        const onLoadMore = vi.fn(defaultLoadMore)
        const { rerender } = render(
            <Harness
                onLoadHistoryUntilPreviousUser={onLoadHistoryUntilPreviousUser}
                onLoadMore={onLoadMore}
                orderedMessageIds={['assistant:4', 'assistant:5', 'assistant:6']}
                historyJumpTargetMessageIds={[]}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 420,
            initialScrollTop: 120
        })
        model.setAnchors([
            { id: 'assistant:4', top: 0 },
            { id: 'assistant:5', top: 140 },
            { id: 'assistant:6', top: 280 }
        ])

        act(() => {
            fireUserScroll(viewport, 120)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        expect(onLoadHistoryUntilPreviousUser).toHaveBeenCalledTimes(1)
        expect(onLoadMore).not.toHaveBeenCalled()
        expect(model.getScrollTop()).toBe(120)

        rerender(
            <Harness
                onLoadHistoryUntilPreviousUser={onLoadHistoryUntilPreviousUser}
                onLoadMore={onLoadMore}
                hasMoreMessages
                isLoadingMoreMessages
                orderedMessageIds={['assistant:4', 'assistant:5', 'assistant:6']}
                historyJumpTargetMessageIds={[]}
            />
        )

        deferred.resolve()

        act(() => {
            rerender(
                <Harness
                    onLoadHistoryUntilPreviousUser={onLoadHistoryUntilPreviousUser}
                    onLoadMore={onLoadMore}
                    hasMoreMessages={false}
                    messagesVersion={1}
                    orderedMessageIds={['user:1', 'assistant:2', 'assistant:3', 'assistant:4', 'assistant:5', 'assistant:6']}
                    historyJumpTargetMessageIds={['user:1']}
                />
            )
        })

        expect(onLoadHistoryUntilPreviousUser).toHaveBeenCalledTimes(1)
        expect(onLoadMore).not.toHaveBeenCalled()
    })

    it('jumps directly to a newly loaded previous user target without restoring the old anchor first', () => {
        const deferred = createDeferredLoadMore()
        const onLoadHistoryUntilPreviousUser = vi.fn(() => deferred.promise)
        const { rerender } = render(
            <Harness
                onLoadHistoryUntilPreviousUser={onLoadHistoryUntilPreviousUser}
                orderedMessageIds={['assistant:4', 'assistant:5', 'assistant:6']}
                historyJumpTargetMessageIds={[]}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 560,
            initialScrollTop: 180
        })
        model.setAnchors([
            { id: 'assistant:4', top: 0 },
            { id: 'assistant:5', top: 140 },
            { id: 'assistant:6', top: 300 }
        ])

        act(() => {
            fireUserScroll(viewport, 180)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        expect(onLoadHistoryUntilPreviousUser).toHaveBeenCalledTimes(1)

        model.clearScrollTopWrites()
        model.setScrollHeight(920)
        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 140 },
            { id: 'assistant:3', top: 280 },
            { id: 'assistant:4', top: 420 },
            { id: 'assistant:5', top: 560 },
            { id: 'assistant:6', top: 720 }
        ])

        deferred.resolve()

        act(() => {
            rerender(
                <Harness
                    onLoadHistoryUntilPreviousUser={onLoadHistoryUntilPreviousUser}
                    hasMoreMessages={false}
                    messagesVersion={1}
                    orderedMessageIds={['user:1', 'assistant:2', 'assistant:3', 'assistant:4', 'assistant:5', 'assistant:6']}
                    historyJumpTargetMessageIds={['user:1']}
                />
            )
        })

        expect(model.getScrollTop()).toBe(0)
        expect(model.getScrollTopWrites()).toEqual([0])
    })

    it('waits for a newly loaded previous user target to reach the DOM before aligning', () => {
        const deferred = createDeferredLoadMore()
        const frameQueue: FrameRequestCallback[] = []
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            frameQueue.push(callback)
            return frameQueue.length
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId: number) => {
            frameQueue.splice(frameId - 1, 1)
        })
        const onLoadHistoryUntilPreviousUser = vi.fn(() => deferred.promise)
        const { rerender } = render(
            <Harness
                onLoadHistoryUntilPreviousUser={onLoadHistoryUntilPreviousUser}
                orderedMessageIds={['assistant:4', 'assistant:5', 'assistant:6']}
                renderedMessageIds={['assistant:4', 'assistant:5', 'assistant:6']}
                historyJumpTargetMessageIds={[]}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 560,
            initialScrollTop: 180
        })
        model.setAnchors([
            { id: 'assistant:4', top: 0 },
            { id: 'assistant:5', top: 140 },
            { id: 'assistant:6', top: 300 }
        ])

        act(() => {
            fireUserScroll(viewport, 180)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        model.setScrollHeight(920)
        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 140 },
            { id: 'assistant:3', top: 280 },
            { id: 'assistant:4', top: 420 },
            { id: 'assistant:5', top: 560 },
            { id: 'assistant:6', top: 720 }
        ])

        deferred.resolve()

        act(() => {
            rerender(
                <Harness
                    onLoadHistoryUntilPreviousUser={onLoadHistoryUntilPreviousUser}
                    hasMoreMessages={false}
                    messagesVersion={1}
                    orderedMessageIds={['user:1', 'assistant:2', 'assistant:3', 'assistant:4', 'assistant:5', 'assistant:6']}
                    renderedMessageIds={['assistant:2', 'assistant:3', 'assistant:4', 'assistant:5', 'assistant:6']}
                    historyJumpTargetMessageIds={['user:1']}
                />
            )
        })

        expect(model.getScrollTop()).toBe(180)
        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(16)
            }
        })

        expect(model.getScrollTop()).toBe(180)

        act(() => {
            rerender(
                <Harness
                    onLoadHistoryUntilPreviousUser={onLoadHistoryUntilPreviousUser}
                    hasMoreMessages={false}
                    messagesVersion={1}
                    orderedMessageIds={['user:1', 'assistant:2', 'assistant:3', 'assistant:4', 'assistant:5', 'assistant:6']}
                    renderedMessageIds={['user:1', 'assistant:2', 'assistant:3', 'assistant:4', 'assistant:5', 'assistant:6']}
                    historyJumpTargetMessageIds={['user:1']}
                />
            )
        })

        act(() => {
            triggerMutationObservers()
        })

        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(32)
            }
        })

        expect(model.getScrollTop()).toBe(0)
    })

    it('keeps a newly loaded previous user target aligned while the loaded page keeps resizing afterwards', () => {
        const deferred = createDeferredLoadMore()
        const frameQueue: FrameRequestCallback[] = []
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            frameQueue.push(callback)
            return frameQueue.length
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId: number) => {
            frameQueue.splice(frameId - 1, 1)
        })
        const onLoadHistoryUntilPreviousUser = vi.fn(() => deferred.promise)
        const { rerender } = render(
            <Harness
                onLoadHistoryUntilPreviousUser={onLoadHistoryUntilPreviousUser}
                orderedMessageIds={['assistant:4', 'assistant:5', 'assistant:6']}
                historyJumpTargetMessageIds={[]}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 560,
            initialScrollTop: 180
        })
        model.setAnchors([
            { id: 'assistant:4', top: 0 },
            { id: 'assistant:5', top: 140 },
            { id: 'assistant:6', top: 300 }
        ])

        act(() => {
            fireUserScroll(viewport, 180)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        model.setScrollHeight(920)
        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 140 },
            { id: 'assistant:3', top: 280 },
            { id: 'assistant:4', top: 420 },
            { id: 'assistant:5', top: 560 },
            { id: 'assistant:6', top: 720 }
        ])

        deferred.resolve()

        act(() => {
            rerender(
                <Harness
                    onLoadHistoryUntilPreviousUser={onLoadHistoryUntilPreviousUser}
                    hasMoreMessages={false}
                    messagesVersion={1}
                    orderedMessageIds={['user:1', 'assistant:2', 'assistant:3', 'assistant:4', 'assistant:5', 'assistant:6']}
                    historyJumpTargetMessageIds={['user:1']}
                />
            )
        })

        expect(model.getScrollTop()).toBe(0)
        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(16)
            }
        })

        model.setScrollHeight(1080)
        model.setAnchors([
            { id: 'user:1', top: 120 },
            { id: 'assistant:2', top: 260 },
            { id: 'assistant:3', top: 400 },
            { id: 'assistant:4', top: 540 },
            { id: 'assistant:5', top: 680 },
            { id: 'assistant:6', top: 840 }
        ])

        act(() => {
            triggerResizeObservers()
        })

        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(32)
            }
        })

        expect(model.getScrollTop()).toBe(120)
    })

    it('corrects small post-commit drift instead of accepting a target that is still a few pixels below the top', () => {
        const deferred = createDeferredLoadMore()
        const frameQueue: FrameRequestCallback[] = []
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            frameQueue.push(callback)
            return frameQueue.length
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId: number) => {
            frameQueue.splice(frameId - 1, 1)
        })
        const onLoadHistoryUntilPreviousUser = vi.fn(() => deferred.promise)
        const { rerender } = render(
            <Harness
                onLoadHistoryUntilPreviousUser={onLoadHistoryUntilPreviousUser}
                orderedMessageIds={['assistant:4', 'assistant:5', 'assistant:6']}
                historyJumpTargetMessageIds={[]}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 560,
            initialScrollTop: 180
        })
        model.setAnchors([
            { id: 'assistant:4', top: 0 },
            { id: 'assistant:5', top: 140 },
            { id: 'assistant:6', top: 300 }
        ])

        act(() => {
            fireUserScroll(viewport, 180)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        model.setScrollHeight(920)
        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 140 },
            { id: 'assistant:3', top: 280 },
            { id: 'assistant:4', top: 420 },
            { id: 'assistant:5', top: 560 },
            { id: 'assistant:6', top: 720 }
        ])

        deferred.resolve()

        act(() => {
            rerender(
                <Harness
                    onLoadHistoryUntilPreviousUser={onLoadHistoryUntilPreviousUser}
                    hasMoreMessages={false}
                    messagesVersion={1}
                    orderedMessageIds={['user:1', 'assistant:2', 'assistant:3', 'assistant:4', 'assistant:5', 'assistant:6']}
                    historyJumpTargetMessageIds={['user:1']}
                />
            )
        })

        expect(model.getScrollTop()).toBe(0)
        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(16)
            }
        })

        model.setAnchors([
            { id: 'user:1', top: 6 },
            { id: 'assistant:2', top: 146 },
            { id: 'assistant:3', top: 286 },
            { id: 'assistant:4', top: 426 },
            { id: 'assistant:5', top: 566 },
            { id: 'assistant:6', top: 726 }
        ])

        act(() => {
            triggerResizeObservers()
        })

        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(32)
            }
        })

        expect(model.getScrollTop()).toBe(6)
    })

    it('loads one older page and preserves the current viewport anchor when near the history boundary', () => {
        const deferred = createDeferredLoadMore()
        const onLoadMore = vi.fn(() => deferred.promise)
        const { rerender } = render(
            <Harness
                onLoadMore={onLoadMore}
                orderedMessageIds={['assistant:1', 'user:2', 'assistant:3']}
                historyJumpTargetMessageIds={['user:2']}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 560,
            initialScrollTop: 40
        })
        model.setAnchors([
            { id: 'assistant:1', top: 0 },
            { id: 'user:2', top: 140 },
            { id: 'assistant:3', top: 300 }
        ])

        act(() => {
            fireUserScroll(viewport, 40)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        expect(onLoadMore).toHaveBeenCalledTimes(1)

        model.setScrollHeight(700)
        model.setAnchors([
            { id: 'user:0', top: 0 },
            { id: 'assistant:1', top: 140 },
            { id: 'user:2', top: 280 },
            { id: 'assistant:3', top: 440 }
        ])

        act(() => {
            rerender(
                <Harness
                    onLoadMore={onLoadMore}
                    messagesVersion={1}
                    orderedMessageIds={['user:0', 'assistant:1', 'user:2', 'assistant:3']}
                    historyJumpTargetMessageIds={['user:0', 'user:2']}
                />
            )
        })

        deferred.resolve()

        expect(model.getScrollTop()).toBe(180)
        expect(model.scrollToMock).not.toHaveBeenCalled()
    })

    it('keeps reserving the history inset while the oldest loaded user jump is still settling', () => {
        render(
            <Harness
                hasMoreMessages={false}
                orderedMessageIds={['user:1', 'assistant:2', 'user:3']}
                historyJumpTargetMessageIds={['user:1', 'user:3']}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 720,
            initialScrollTop: 300
        })
        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 180 },
            { id: 'user:3', top: 360 }
        ])

        act(() => {
            fireUserScroll(viewport, 300)
        })

        expect(screen.getByTestId('history-visible')).toHaveTextContent('true')
        expect(screen.getByTestId('history-inset')).toHaveTextContent('true')

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
            fireEvent.scroll(viewport)
        })

        expect(model.getScrollTop()).toBe(0)
        expect(screen.getByTestId('history-visible')).toHaveTextContent('true')
        expect(screen.getByTestId('history-inset')).toHaveTextContent('true')
    })

    it('keeps preserving the same top anchor if the prepended history keeps resizing after commit', () => {
        const deferred = createDeferredLoadMore()
        const onLoadMore = vi.fn(() => deferred.promise)
        const frameQueue: FrameRequestCallback[] = []
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            frameQueue.push(callback)
            return frameQueue.length
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId: number) => {
            frameQueue.splice(frameId - 1, 1)
        })

        const { rerender } = render(
            <Harness
                onLoadMore={onLoadMore}
                orderedMessageIds={['assistant:1', 'user:2', 'assistant:3']}
                historyJumpTargetMessageIds={['user:2']}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 560,
            initialScrollTop: 40
        })
        model.setAnchors([
            { id: 'assistant:1', top: 0 },
            { id: 'user:2', top: 140 },
            { id: 'assistant:3', top: 300 }
        ])

        act(() => {
            fireUserScroll(viewport, 40)
        })

        act(() => {
            fireEvent.click(screen.getByTestId('history-control'))
        })

        model.setScrollHeight(700)
        model.setAnchors([
            { id: 'user:0', top: 0 },
            { id: 'assistant:1', top: 140 },
            { id: 'user:2', top: 280 },
            { id: 'assistant:3', top: 440 }
        ])

        act(() => {
            rerender(
                <Harness
                    onLoadMore={onLoadMore}
                    messagesVersion={1}
                    orderedMessageIds={['user:0', 'assistant:1', 'user:2', 'assistant:3']}
                    historyJumpTargetMessageIds={['user:0', 'user:2']}
                />
            )
        })

        expect(model.getScrollTop()).toBe(180)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(16)
            }
        })

        model.setScrollHeight(920)
        model.setAnchors([
            { id: 'user:0', top: 0 },
            { id: 'assistant:1', top: 360 },
            { id: 'user:2', top: 500 },
            { id: 'assistant:3', top: 660 }
        ])

        act(() => {
            triggerResizeObservers()
        })

        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(32)
            }
        })

        deferred.resolve()

        expect(model.getScrollTop()).toBe(400)
        expect(model.scrollToMock).not.toHaveBeenCalled()
    })

    it('keeps following the bottom when new content arrives while already at bottom', () => {
        const { result, rerender } = renderHook((messagesVersion: number) => useThreadViewport({
            sessionId: 'session-bottom',
            hasMoreMessages: true,
            isLoadingMessages: false,
            isLoadingMoreMessages: false,
            onLoadHistoryUntilPreviousUser: async () => ({ didLoadOlderMessages: true }),
            onLoadMore: async () => ({ didLoadOlderMessages: true }),
            onAtBottomChange: vi.fn(),
            onFlushPending: vi.fn(),
            messagesVersion,
            streamVersion: 0,
            orderedMessageIds: [],
            conversationMessageIds: [],
            threadMessageOwnerById: new Map(),
            historyJumpTargetMessageIds: [],
            forceScrollToken: 0,
        }), {
            initialProps: 0
        })

        const viewport = document.createElement('div')
        const model = decorateViewport(viewport, {
            clientHeight: 400,
            scrollHeight: 640,
            initialScrollTop: 240
        })

        act(() => {
            result.current.viewportRef.current = viewport
        })

        model.setScrollHeight(880)
        rerender(1)

        expect(model.getScrollTop()).toBe(480)
    })

    it('sticks to the bottom when entering a session that already has loaded messages', () => {
        const { rerender } = render(<Harness sessionId="session-1" pinToBottomOnSessionEntry />)

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 400,
            scrollHeight: 960,
            initialScrollTop: 320
        })

        rerender(<Harness sessionId="session-2" />)

        expect(model.getScrollTop()).toBe(560)
    })

    it('pins the current session to the bottom when the first loaded message layout resolves', () => {
        const { result, rerender } = renderHook((messagesVersion: number) => useThreadViewport({
            sessionId: 'session-entry',
            hasMoreMessages: true,
            isLoadingMessages: false,
            isLoadingMoreMessages: false,
            pinToBottomOnSessionEntry: true,
            onLoadHistoryUntilPreviousUser: async () => ({ didLoadOlderMessages: true }),
            onLoadMore: async () => ({ didLoadOlderMessages: true }),
            onAtBottomChange: vi.fn(),
            onFlushPending: vi.fn(),
            messagesVersion,
            streamVersion: 0,
            orderedMessageIds: ['assistant:1'],
            conversationMessageIds: ['assistant:1'],
            threadMessageOwnerById: new Map([['assistant:1', 'assistant:1']]),
            historyJumpTargetMessageIds: [],
            forceScrollToken: 0,
        }), {
            initialProps: 0
        })

        const viewport = document.createElement('div')
        const model = decorateViewport(viewport, {
            clientHeight: 400,
            scrollHeight: 960,
            initialScrollTop: 320
        })

        act(() => {
            result.current.viewportRef.current = viewport
        })

        rerender(1)

        expect(model.getScrollTop()).toBe(560)
    })

    it('keeps sticking to the bottom while the loaded thread keeps resizing after the first bottom sync', () => {
        const frameQueue: FrameRequestCallback[] = []
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            frameQueue.push(callback)
            return frameQueue.length
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId: number) => {
            frameQueue.splice(frameId - 1, 1)
        })

        const { result, rerender } = renderHook((messagesVersion: number) => useThreadViewport({
            sessionId: 'session-bottom-resize',
            hasMoreMessages: true,
            isLoadingMessages: false,
            isLoadingMoreMessages: false,
            onLoadHistoryUntilPreviousUser: async () => ({ didLoadOlderMessages: true }),
            onLoadMore: async () => ({ didLoadOlderMessages: true }),
            onAtBottomChange: vi.fn(),
            onFlushPending: vi.fn(),
            messagesVersion,
            streamVersion: 0,
            orderedMessageIds: [],
            conversationMessageIds: [],
            threadMessageOwnerById: new Map(),
            historyJumpTargetMessageIds: [],
            forceScrollToken: 0,
        }), {
            initialProps: 0
        })

        const viewport = document.createElement('div')
        const model = decorateViewport(viewport, {
            clientHeight: 400,
            scrollHeight: 640,
            initialScrollTop: 240
        })

        act(() => {
            result.current.viewportRef.current = viewport
        })

        model.setScrollHeight(880)
        rerender(1)

        expect(model.getScrollTop()).toBe(480)
        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(16)
            }
        })

        model.setScrollHeight(1040)

        act(() => {
            triggerResizeObservers()
        })

        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(32)
            }
        })

        expect(model.getScrollTop()).toBe(640)
    })

    it('keeps following the bottom while a transient stream grows if the viewport is still pinned', () => {
        const { rerender } = render(<Harness streamVersion={0} />)

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 400,
            scrollHeight: 640,
            initialScrollTop: 240
        })

        act(() => {
            fireUserScroll(viewport, 240)
        })

        model.setScrollHeight(880)
        rerender(<Harness streamVersion={1} />)

        expect(model.getScrollTop()).toBe(480)
    })

    it('releases auto-follow immediately once the user scrolls away from the pinned bottom during streaming', () => {
        const { rerender } = render(<Harness streamVersion={0} />)

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 400,
            scrollHeight: 640,
            initialScrollTop: 240
        })

        act(() => {
            fireUserScroll(viewport, 240)
        })

        act(() => {
            fireEvent.wheel(viewport)
            viewport.scrollTop = 200
            fireEvent.scroll(viewport)
        })

        model.setScrollHeight(880)
        rerender(<Harness streamVersion={1} />)

        expect(model.getScrollTop()).toBe(200)
    })

    it('reports that the viewport is away from the bottom after the user scrolls upward', () => {
        render(
            <Harness
                hasMoreMessages={false}
                orderedMessageIds={['user:1', 'assistant:2', 'assistant:3']}
                historyJumpTargetMessageIds={['user:1']}
            />
        )

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 220,
            scrollHeight: 760,
            initialScrollTop: 540
        })
        model.setAnchors([
            { id: 'user:1', top: 0 },
            { id: 'assistant:2', top: 200 },
            { id: 'assistant:3', top: 520 }
        ])

        act(() => {
            fireUserScroll(viewport, 120)
        })

        expect(screen.getByTestId('at-bottom')).toHaveTextContent('false')
    })

    it('keeps the forced bottom pin while the thread keeps resizing after a send-triggered jump', () => {
        const frameQueue: FrameRequestCallback[] = []
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            frameQueue.push(callback)
            return frameQueue.length
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId: number) => {
            frameQueue.splice(frameId - 1, 1)
        })

        const { rerender } = render(<Harness forceScrollToken={0} />)

        const viewport = screen.getByTestId('viewport') as HTMLDivElement
        const model = decorateViewport(viewport, {
            clientHeight: 400,
            scrollHeight: 640,
            initialScrollTop: 120
        })

        act(() => {
            fireUserScroll(viewport, 120)
        })

        rerender(<Harness forceScrollToken={1} />)

        expect(model.getScrollTop()).toBe(240)
        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(16)
            }
        })

        act(() => {
            fireEvent.scroll(viewport)
        })

        model.setScrollHeight(920)

        act(() => {
            triggerResizeObservers()
        })

        expect(frameQueue).toHaveLength(1)

        act(() => {
            const nextFrame = frameQueue.shift()
            if (nextFrame) {
                nextFrame(32)
            }
        })

        expect(model.getScrollTop()).toBe(520)
    })
})
