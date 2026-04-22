import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTranscriptRenderRows } from '@/chat/transcriptRenderRows'
import type { TranscriptRow } from '@/chat/transcriptTypes'
import { resetForegroundPulseForTests } from '@/lib/foregroundPulse'
import { installQueuedAnimationFrameHarness } from './transcriptTestSupport'
import { useTranscriptVirtuoso } from './useTranscriptVirtuoso'

function createTranscriptRow(
    id: string,
    conversationId: string,
    type: TranscriptRow['type'] = 'assistant-text',
    localId: string | null = null
): TranscriptRow {
    if (type === 'user') {
        return {
            id,
            type,
            conversationId,
            depth: 0,
            copyText: id,
            tone: 'user',
            block: {
                kind: 'user-text',
                id,
                localId,
                createdAt: 1,
                text: id,
                renderMode: 'plain',
            },
        }
    }

    return {
        id,
        type: 'assistant-text',
        conversationId,
        depth: 0,
        copyText: id,
        block: {
            kind: 'agent-text',
            id,
            localId: null,
            createdAt: 1,
            text: id,
            renderMode: 'plain',
        },
    }
}

function createTranscriptOptions(overrides?: Partial<Parameters<typeof useTranscriptVirtuoso>[0]>) {
    const rows = buildTranscriptRenderRows([
        createTranscriptRow('user:1', 'conversation-user-1', 'user'),
        createTranscriptRow('assistant:2', 'conversation-assistant-2'),
    ])

    return {
        sessionId: 'session-1',
        rows,
        conversationIds: ['conversation-user-1', 'conversation-assistant-2'],
        rowStartIndexByConversationId: new Map([
            ['conversation-user-1', 0],
            ['conversation-assistant-2', 1],
        ]),
        historyJumpTargetConversationIds: ['conversation-user-1'],
        hasMoreMessages: false,
        isLoadingMessages: false,
        isLoadingMoreMessages: false,
        onLoadHistoryUntilPreviousUser: vi.fn(async () => ({ didLoadOlderMessages: true })),
        onAtBottomChange: vi.fn(),
        onFlushPending: vi.fn(),
        activeTurnLocalId: null,
        composerAnchorTop: 0,
        ...overrides,
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    resetForegroundPulseForTests()
    document.documentElement.style.removeProperty('--chat-header-anchor-space')
})

describe('useTranscriptVirtuoso', () => {
    it('seeds session entry from the last local transcript row on every mount', () => {
        const options = createTranscriptOptions()
        const firstMount = renderHook(() => useTranscriptVirtuoso(options))
        expect(firstMount.result.current.initialTopMostItemIndex).toEqual({
            index: 1,
            align: 'end',
        })

        firstMount.unmount()

        const secondMount = renderHook(() => useTranscriptVirtuoso(options))

        expect(secondMount.result.current.initialTopMostItemIndex).toEqual({
            index: 1,
            align: 'end',
        })
    })

    it('pins to the last local row when the first transcript batch arrives after an empty mount', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const emptyOptions = createTranscriptOptions({
                rows: [],
                conversationIds: [],
                rowStartIndexByConversationId: new Map(),
                historyJumpTargetConversationIds: [],
            })
            const populatedOptions = createTranscriptOptions()
            const { result, rerender } = renderHook(
                ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) =>
                    useTranscriptVirtuoso(options),
                {
                    initialProps: {
                        options: emptyOptions,
                    },
                }
            )
            const scrollTo = vi.fn(() => {
                const viewport = result.current.viewportRef.current
                if (!viewport) {
                    return
                }

                viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight
            })

            act(() => {
                result.current.virtuosoRef.current = {
                    scrollTo,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = {
                    clientHeight: 400,
                    scrollHeight: 1200,
                    scrollTop: 0,
                } as never
            })

            rerender({
                options: populatedOptions,
            })

            act(() => {
                frameQueue.flushAllFrames()
            })

            expect(scrollTo).toHaveBeenCalledWith({
                top: 800,
                behavior: 'auto',
            })
        } finally {
            frameQueue.restore()
        }
    })

    it('keeps viewport and virtuoso callback refs stable across rerenders', () => {
        const initialOptions = createTranscriptOptions()
        const { result, rerender } = renderHook(
            ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) => useTranscriptVirtuoso(options),
            {
                initialProps: {
                    options: initialOptions,
                },
            }
        )
        const initialViewportSetter = result.current.setViewportRef
        const initialVirtuosoSetter = result.current.setVirtuosoRef

        rerender({
            options: createTranscriptOptions({
                onAtBottomChange: vi.fn(),
                onFlushPending: vi.fn(),
            }),
        })

        expect(result.current.setViewportRef).toBe(initialViewportSetter)
        expect(result.current.setVirtuosoRef).toBe(initialVirtuosoSetter)
    })

    it('re-runs the resting bottom transaction when the composer anchor geometry moves after entry', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const scrollTo = vi.fn(({ top }: { top: number }) => {
                viewport.scrollTop = top
            })
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1200,
                scrollTop: 800,
                getBoundingClientRect: () =>
                    ({
                        top: 80,
                        bottom: 480,
                    }) as DOMRect,
                querySelectorAll: () => [],
            }
            const { result, rerender } = renderHook(
                ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) =>
                    useTranscriptVirtuoso(options),
                {
                    initialProps: {
                        options: createTranscriptOptions({
                            composerAnchorTop: 0,
                        }),
                    },
                }
            )

            act(() => {
                result.current.setVirtuosoRef({
                    scrollTo,
                    getState: vi.fn(),
                } as never)
                result.current.setViewportRef(viewport as never)
                frameQueue.flushAllFrames()
            })

            scrollTo.mockClear()
            viewport.scrollHeight = 1272

            rerender({
                options: createTranscriptOptions({
                    composerAnchorTop: 64,
                }),
            })

            act(() => {
                frameQueue.flushAllFrames()
            })

            expect(scrollTo).toHaveBeenCalledWith({
                top: 872,
                behavior: 'auto',
            })
        } finally {
            frameQueue.restore()
        }
    })

    it('keeps the entry bottom transaction pending until the viewport and virtuoso handle are both mounted', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const options = createTranscriptOptions({
                onAtBottomChange: vi.fn(),
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            const scrollTo = vi.fn(() => {
                const viewport = result.current.viewportRef.current
                if (!viewport) {
                    return
                }

                viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight
            })

            act(() => {
                result.current.handleAtBottomStateChange(true)
                frameQueue.flushNextFrame()
            })

            expect(options.onAtBottomChange).not.toHaveBeenCalledWith(true)
            expect(scrollTo).not.toHaveBeenCalled()

            act(() => {
                result.current.setVirtuosoRef({
                    scrollTo,
                    getState: vi.fn(),
                } as never)
                result.current.setViewportRef({
                    clientHeight: 400,
                    scrollHeight: 1200,
                    scrollTop: 0,
                } as never)
                result.current.handleAtBottomStateChange(true)
                frameQueue.flushAllFrames()
            })

            expect(scrollTo).toHaveBeenCalledWith({
                top: 800,
                behavior: 'auto',
            })
        } finally {
            frameQueue.restore()
        }
    })

    it('locks manual mode on upward wheel intent and autoscrolls explicitly to bottom on demand', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const options = createTranscriptOptions({
                onAtBottomChange: vi.fn(),
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            const scrollTo = vi.fn()

            act(() => {
                result.current.virtuosoRef.current = {
                    scrollTo,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = {
                    clientHeight: 400,
                    scrollHeight: 1200,
                    scrollTop: 0,
                } as never
                result.current.handleViewportWheelCapture({ deltaY: -120 })
            })

            expect(options.onAtBottomChange).toHaveBeenCalledWith(false)

            act(() => {
                result.current.scrollToBottom()
                frameQueue.flushAllFrames()
            })

            expect(scrollTo).toHaveBeenCalledWith({
                top: 800,
                behavior: 'smooth',
            })
        } finally {
            frameQueue.restore()
        }
    })

    it('does not leave bottom on downward wheel overscroll while already following', () => {
        const options = createTranscriptOptions({
            onAtBottomChange: vi.fn(),
        })
        const { result } = renderHook(() => useTranscriptVirtuoso(options))

        act(() => {
            result.current.handleViewportWheelCapture({ deltaY: 120 })
        })

        expect(options.onAtBottomChange).not.toHaveBeenCalledWith(false)
    })

    it('immediately flips to manual on an upward wheel intent even before the viewport physically leaves the resting bottom', () => {
        const options = createTranscriptOptions({
            onAtBottomChange: vi.fn(),
        })
        const { result } = renderHook(() => useTranscriptVirtuoso(options))

        act(() => {
            result.current.viewportRef.current = {
                clientHeight: 400,
                scrollHeight: 1200,
                scrollTop: 800,
            } as never
            result.current.handleViewportWheelCapture({ deltaY: -120 })
        })

        expect(options.onAtBottomChange).toHaveBeenCalledWith(false)
    })

    it('does not treat a raw viewport scroll as manual leave-bottom intent without a gesture signal', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const options = createTranscriptOptions({
                onAtBottomChange: vi.fn(),
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1200,
                scrollTop: 800,
            }

            act(() => {
                result.current.setViewportRef(viewport as never)
                result.current.setVirtuosoRef({
                    scrollTo: vi.fn(() => {
                        viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight
                    }),
                    getState: vi.fn(),
                } as never)
                frameQueue.flushAllFrames()
                viewport.scrollTop = 760
                result.current.handleViewportScrollCapture()
            })

            expect(options.onAtBottomChange).not.toHaveBeenCalledWith(false)
        } finally {
            frameQueue.restore()
        }
    })

    it('ignores raw scroll capture while the viewport is still resting at bottom', () => {
        const options = createTranscriptOptions({
            onAtBottomChange: vi.fn(),
        })
        const { result } = renderHook(() => useTranscriptVirtuoso(options))

        act(() => {
            result.current.viewportRef.current = {
                clientHeight: 400,
                scrollHeight: 1200,
                scrollTop: 800,
            } as never
            result.current.handleViewportScrollCapture()
        })

        expect(options.onAtBottomChange).not.toHaveBeenCalledWith(false)
    })

    it('does not flip into manual mode when raw scroll happens without an explicit leave-bottom gesture', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const options = createTranscriptOptions({
                onAtBottomChange: vi.fn(),
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1200,
                scrollTop: 800,
            }
            const autoscrollToBottom = vi.fn(() => {
                viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight
            })

            act(() => {
                result.current.setViewportRef(viewport as never)
                result.current.setVirtuosoRef({
                    autoscrollToBottom,
                    scrollTo: vi.fn(),
                    getState: vi.fn(),
                } as never)
                result.current.handleAtBottomStateChange(true)
                viewport.scrollTop = 760
                result.current.handleAtBottomStateChange(false)
                result.current.handleViewportScrollCapture()
                frameQueue.flushAllFrames()
            })

            expect(autoscrollToBottom).not.toHaveBeenCalled()
        } finally {
            frameQueue.restore()
        }
    })

    it('does not flip to manual when virtuoso briefly reports atBottom=false while still following', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const options = createTranscriptOptions({
                onAtBottomChange: vi.fn(),
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            const autoscrollToBottom = vi.fn()

            act(() => {
                result.current.viewportRef.current = {
                    clientHeight: 400,
                    scrollHeight: 1200,
                    scrollTop: 800,
                } as never
                result.current.virtuosoRef.current = {
                    autoscrollToBottom,
                    scrollTo: vi.fn(),
                    getState: vi.fn(),
                } as never
                result.current.handleAtBottomStateChange(true)
                frameQueue.flushAllFrames()
                result.current.handleAtBottomStateChange(false)
                frameQueue.flushAllFrames()
            })

            expect(options.onAtBottomChange).not.toHaveBeenCalledWith(false)
            expect(autoscrollToBottom).toHaveBeenCalledTimes(1)
        } finally {
            frameQueue.restore()
        }
    })

    it('only leaves bottom when a touch gesture moves downward away from the composer', () => {
        const options = createTranscriptOptions({
            onAtBottomChange: vi.fn(),
        })
        const { result } = renderHook(() => useTranscriptVirtuoso(options))

        act(() => {
            result.current.handleViewportTouchStartCapture({
                touches: [{ clientY: 240 }] as unknown as TouchList,
            })
            result.current.handleViewportTouchMoveCapture({
                touches: [{ clientY: 232 }] as unknown as TouchList,
            })
        })

        expect(options.onAtBottomChange).not.toHaveBeenCalledWith(false)

        act(() => {
            result.current.handleViewportTouchStartCapture({
                touches: [{ clientY: 240 }] as unknown as TouchList,
            })
            result.current.handleViewportTouchMoveCapture({
                touches: [{ clientY: 256 }] as unknown as TouchList,
            })
        })

        expect(options.onAtBottomChange).toHaveBeenCalledWith(false)
    })

    it('decreases firstItemIndex when older rows are prepended', () => {
        const initialOptions = createTranscriptOptions()
        const { result, rerender } = renderHook(
            ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) => useTranscriptVirtuoso(options),
            {
                initialProps: {
                    options: initialOptions,
                },
            }
        )

        expect(result.current.firstItemIndex).toBe(100000)

        rerender({
            options: createTranscriptOptions({
                rows: buildTranscriptRenderRows([
                    createTranscriptRow('user:0', 'conversation-user-0', 'user'),
                    ...initialOptions.rows.map((row) => row.row),
                ]),
                conversationIds: ['conversation-user-0', ...initialOptions.conversationIds],
                rowStartIndexByConversationId: new Map([
                    ['conversation-user-0', 0],
                    ['conversation-user-1', 1],
                    ['conversation-assistant-2', 2],
                ]),
                historyJumpTargetConversationIds: ['conversation-user-0', 'conversation-user-1'],
                hasMoreMessages: true,
            }),
        })

        expect(result.current.firstItemIndex).toBe(99999)
    })

    it('flushes pending and re-enters following mode once the list reaches the bottom', () => {
        const options = createTranscriptOptions({
            onAtBottomChange: vi.fn(),
            onFlushPending: vi.fn(),
        })
        const { result } = renderHook(() => useTranscriptVirtuoso(options))

        act(() => {
            result.current.handleViewportWheelCapture({ deltaY: -120 })
            result.current.handleAtBottomStateChange(true)
        })

        expect(options.onAtBottomChange).toHaveBeenLastCalledWith(true)
        expect(options.onFlushPending).toHaveBeenCalledTimes(1)
    })

    it('locks manual mode on explicit leave-bottom intent and stops follow-up height changes from stealing control', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const options = createTranscriptOptions({
                onAtBottomChange: vi.fn(),
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            const autoscrollToBottom = vi.fn()

            act(() => {
                result.current.virtuosoRef.current = {
                    autoscrollToBottom,
                    getState: vi.fn(),
                } as never
                result.current.handleViewportWheelCapture({ deltaY: -120 })
                result.current.handleTotalListHeightChanged()
                frameQueue.flushAllFrames()
            })

            expect(options.onAtBottomChange).toHaveBeenCalledWith(false)
            expect(autoscrollToBottom).not.toHaveBeenCalled()
        } finally {
            frameQueue.restore()
        }
    })

    it('latches manual mode immediately when an upward wheel intent arrives before late height growth can re-pin the bottom', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const options = createTranscriptOptions({
                onAtBottomChange: vi.fn(),
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            const autoscrollToBottom = vi.fn()

            act(() => {
                result.current.setViewportRef({
                    clientHeight: 400,
                    scrollHeight: 1200,
                    scrollTop: 800,
                } as never)
                result.current.setVirtuosoRef({
                    autoscrollToBottom,
                    scrollTo: vi.fn(),
                    getState: vi.fn(),
                } as never)
                result.current.handleAtBottomStateChange(true)
                result.current.handleViewportWheelCapture({ deltaY: -120 })
                result.current.handleTotalListHeightChanged()
                frameQueue.flushAllFrames()
            })

            expect(options.onAtBottomChange).toHaveBeenCalledWith(false)
            expect(autoscrollToBottom).not.toHaveBeenCalled()
        } finally {
            frameQueue.restore()
        }
    })

    it('starts an explicit bottom transaction after list height changes while following', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const { result } = renderHook(() => useTranscriptVirtuoso(createTranscriptOptions()))
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1200,
                scrollTop: 800,
            }
            const scrollTo = vi.fn(() => {
                viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight
            })

            act(() => {
                result.current.viewportRef.current = viewport as never
                result.current.virtuosoRef.current = {
                    scrollTo,
                    getState: vi.fn(),
                } as never
                result.current.handleAtBottomStateChange(true)
                viewport.scrollHeight = 1280
                frameQueue.flushAllFrames()
                result.current.handleTotalListHeightChanged()
                frameQueue.flushAllFrames()
            })

            expect(scrollTo).toHaveBeenCalledWith({
                top: 880,
                behavior: 'auto',
            })
        } finally {
            frameQueue.restore()
        }
    })

    it('re-enters an explicit bottom transaction when late list growth leaves entry slightly above the resting bottom', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const { result } = renderHook(() => useTranscriptVirtuoso(createTranscriptOptions()))
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1200,
                scrollTop: 800,
            }
            const scrollTo = vi.fn(() => {
                viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight
            })
            const autoscrollToBottom = vi.fn()

            act(() => {
                result.current.setVirtuosoRef({
                    autoscrollToBottom,
                    scrollTo,
                    getState: vi.fn(),
                } as never)
                result.current.setViewportRef(viewport as never)
                result.current.handleAtBottomStateChange(true)
                frameQueue.flushAllFrames()
            })

            act(() => {
                viewport.scrollHeight = 1280
                result.current.handleTotalListHeightChanged()
                frameQueue.flushAllFrames()
            })

            expect(scrollTo).toHaveBeenCalledWith({
                top: 880,
                behavior: 'auto',
            })
            expect(viewport.scrollTop).toBe(880)
        } finally {
            frameQueue.restore()
        }
    })

    it('does not carry manual follow mode across same-session remounts', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const options = createTranscriptOptions({
                onAtBottomChange: vi.fn(),
            })
            const firstMount = renderHook(() => useTranscriptVirtuoso(options))
            const secondViewport = {
                clientHeight: 400,
                scrollHeight: 1200,
                scrollTop: 800,
            }

            act(() => {
                firstMount.result.current.virtuosoRef.current = {
                    getState: (callback: (snapshot: never) => void) => callback({} as never),
                } as never
                firstMount.result.current.handleViewportWheelCapture({ deltaY: -120 })
            })

            firstMount.unmount()

            const secondMount = renderHook(() => useTranscriptVirtuoso(options))
            const autoscrollToBottom = vi.fn()

            act(() => {
                secondMount.result.current.viewportRef.current = secondViewport as never
                secondMount.result.current.virtuosoRef.current = {
                    autoscrollToBottom,
                    scrollTo: vi.fn(() => {
                        const viewport = secondMount.result.current.viewportRef.current
                        if (!viewport) {
                            return
                        }
                        viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight
                    }),
                    getState: vi.fn(),
                } as never
                secondMount.result.current.handleAtBottomStateChange(true)
                secondViewport.scrollHeight = 1280
                frameQueue.flushAllFrames()
                secondMount.result.current.handleTotalListHeightChanged()
                frameQueue.flushAllFrames()
            })

            expect(autoscrollToBottom).not.toHaveBeenCalled()
        } finally {
            frameQueue.restore()
        }
    })

    it('does not treat a bottom-bound programmatic scroll sequence as manual leave-bottom intent', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const onAtBottomChange = vi.fn()
            const { result } = renderHook(() =>
                useTranscriptVirtuoso(
                    createTranscriptOptions({
                        onAtBottomChange,
                    })
                )
            )
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1600,
                scrollTop: 200,
            }
            const scrollTo = vi.fn(({ top }: { top: number }) => {
                viewport.scrollTop = Math.min(top, viewport.scrollTop + 180)
            })

            act(() => {
                result.current.viewportRef.current = viewport as never
                result.current.virtuosoRef.current = {
                    scrollTo,
                    getState: vi.fn(),
                } as never
                result.current.scrollToBottom()
                frameQueue.flushNextFrame()
            })

            act(() => {
                result.current.handleViewportScrollCapture()
                viewport.scrollTop = 560
                result.current.handleViewportScrollCapture()
                frameQueue.flushAllFrames()
            })

            expect(onAtBottomChange).not.toHaveBeenCalledWith(false)
        } finally {
            frameQueue.restore()
        }
    })

    it('keeps driving a single explicit-bottom transaction until a growing viewport settles at the real resting bottom', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const options = createTranscriptOptions({
                onAtBottomChange: vi.fn(),
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1080,
                scrollTop: 0,
            }
            const scrollTo = vi.fn(() => {
                viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight
            })

            act(() => {
                result.current.viewportRef.current = viewport as never
                result.current.virtuosoRef.current = {
                    scrollTo,
                    getState: vi.fn(),
                } as never
                result.current.scrollToBottom()
                for (let frame = 0; frame < 24; frame += 1) {
                    if (frame < 18) {
                        viewport.scrollHeight += 20
                    }
                    frameQueue.flushNextFrame()
                }
            })

            expect(scrollTo.mock.calls.length).toBeGreaterThan(8)
            expect(viewport.scrollTop).toBe(viewport.scrollHeight - viewport.clientHeight)
        } finally {
            frameQueue.restore()
        }
    })
})
