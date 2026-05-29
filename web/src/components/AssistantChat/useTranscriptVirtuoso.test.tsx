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
    // Default to assistant-only rows so the entry-anchored reveal in
    // useTranscriptActiveTurnAnchor does NOT trigger here — entry reveal only
    // fires when there is at least one user turn. Tests that exercise the
    // entry-anchored path opt-in via overrides with explicit user rows.
    const rows = buildTranscriptRenderRows([
        createTranscriptRow('assistant:1', 'conversation-assistant-1'),
        createTranscriptRow('assistant:2', 'conversation-assistant-2'),
    ])

    return {
        sessionId: 'session-1',
        rows,
        rowStartIndexByConversationId: new Map([
            ['conversation-assistant-1', 0],
            ['conversation-assistant-2', 1],
        ]),
        onAtBottomChange: vi.fn(),
        onFlushPending: vi.fn(),
        activeTurnLocalId: null,
        composerAnchorTop: 0,
        onLoadOlderHistory: vi.fn(),
        ...overrides,
        hasMoreHistory: overrides?.hasMoreHistory ?? false,
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    resetForegroundPulseForTests()
    document.documentElement.style.removeProperty('--chat-header-anchor-space')
})

function invokeFollowOutput(
    followOutput: ReturnType<typeof useTranscriptVirtuoso>['followOutput'],
    isAtBottom: boolean
): boolean | 'auto' | 'smooth' {
    return typeof followOutput === 'function' ? followOutput(isAtBottom) : followOutput
}

/**
 * Simulates virtuoso completing its mount-time `initialTopMostItemIndex` scroll
 * and reporting entry-at-bottom for the first time. Required before any test
 * that exercises follow-mode auto-scroll or reverse history prefetch — the
 * hook gates both behind this single settled signal.
 */
function settleEntryBottom(result: { current: ReturnType<typeof useTranscriptVirtuoso> }): void {
    act(() => {
        result.current.handleAtBottomStateChange(false)
        result.current.handleAtBottomStateChange(true)
    })
}

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
        // Entry scroll is now owned exclusively by virtuoso's
        // `initialTopMostItemIndex` + `followOutput`. The hook itself must not
        // race virtuoso with its own scrollTo on first row arrival, otherwise
        // the viewport lands at a random middle position on session entry.
        // What the hook MUST guarantee:
        //   1. `initialTopMostItemIndex` always seeds the bottom on mount.
        //   2. `followOutput` returns `'auto'` while we are still following,
        //      so virtuoso auto-scrolls as the first batch appends.
        const emptyOptions = createTranscriptOptions({
            rows: [],
            rowStartIndexByConversationId: new Map(),
        })
        const populatedOptions = createTranscriptOptions()
        const { result, rerender } = renderHook(
            ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) => useTranscriptVirtuoso(options),
            {
                initialProps: {
                    options: emptyOptions,
                },
            }
        )

        expect(result.current.initialTopMostItemIndex).toBeUndefined()
        expect(invokeFollowOutput(result.current.followOutput, true)).toBe('auto')

        rerender({
            options: populatedOptions,
        })

        expect(result.current.initialTopMostItemIndex).toEqual({
            index: 1,
            align: 'end',
        })
        expect(invokeFollowOutput(result.current.followOutput, true)).toBe('auto')
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
                // Simulate virtuoso confirming its mount-time scroll has
                // landed at the bottom — only then is it safe for our hook to
                // re-pin via an explicit-bottom transaction when later signals
                // (composer anchor, list height) arrive.
                result.current.handleAtBottomStateChange(true)
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

    it('exposes a stable bottom-anchored initialTopMostItemIndex regardless of when virtuoso/viewport refs attach', () => {
        // Entry scroll is owned by virtuoso's `initialTopMostItemIndex`, so the
        // hook contract here is: the prop value the hook publishes for virtuoso
        // is stable and correctly bottom-anchored even before the refs land.
        // Once virtuoso reports `atBottom: true` for the first time, the hook
        // marks the entry as settled and `onAtBottomChange` is forwarded so the
        // session UI can flip away from the loading skeleton.
        const onAtBottomChange = vi.fn()
        const options = createTranscriptOptions({
            onAtBottomChange,
        })
        const { result } = renderHook(() => useTranscriptVirtuoso(options))

        expect(result.current.initialTopMostItemIndex).toEqual({
            index: 1,
            align: 'end',
        })

        act(() => {
            // Virtuoso typically fires `false` while it is still executing the
            // mount-time scroll, then `true` once the scroll settles. Replay
            // that exact sequence so the test observes both transitions.
            result.current.handleAtBottomStateChange(false)
            result.current.handleAtBottomStateChange(true)
        })

        expect(onAtBottomChange).toHaveBeenLastCalledWith(true)
    })

    it('corrects a stale entry atBottom=true signal instead of latching manual mode', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1200,
                scrollTop: 320,
                querySelectorAll: () => [],
            }
            const scrollTo = vi.fn(({ top }: { top: number }) => {
                viewport.scrollTop = top
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(createTranscriptOptions()))

            act(() => {
                result.current.setVirtuosoRef({
                    scrollTo,
                    getState: vi.fn(),
                } as never)
                result.current.setViewportRef(viewport as never)
                result.current.handleAtBottomStateChange(true)
                frameQueue.flushAllFrames()
            })

            expect(scrollTo).toHaveBeenCalledWith({
                top: 800,
                behavior: 'auto',
            })
            expect(invokeFollowOutput(result.current.followOutput, true)).toBe('auto')
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

    it('decreases firstItemIndex atomically in the same render as the prepended rows arrive', () => {
        // Regression guard for the "messages blank out then snap to bottom" bug:
        // when prepended rows arrive, firstItemIndex MUST be in lock-step with
        // the data array on the same React render so virtuoso never sees the
        // new rows with a stale firstItemIndex (which would treat them as a
        // tail append, push total list height, then rebase on the next commit).
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
                rowStartIndexByConversationId: new Map([
                    ['conversation-user-0', 0],
                    ['conversation-user-1', 1],
                    ['conversation-assistant-2', 2],
                ]),
            }),
        })

        expect(result.current.firstItemIndex).toBe(99999)
    })

    it('decreases firstItemIndex when older rows prepend while the streaming tail is replaced', () => {
        const initialRows = buildTranscriptRenderRows([
            createTranscriptRow('assistant:1', 'conversation-assistant-1'),
            createTranscriptRow('stream:tail', 'conversation-stream-tail'),
        ])
        const { result, rerender } = renderHook(
            ({ rows }: { rows: ReturnType<typeof buildTranscriptRenderRows> }) =>
                useTranscriptVirtuoso(
                    createTranscriptOptions({
                        rows,
                        rowStartIndexByConversationId: new Map(),
                    })
                ),
            { initialProps: { rows: initialRows } }
        )

        rerender({
            rows: buildTranscriptRenderRows([
                createTranscriptRow('user:0', 'conversation-user-0', 'user'),
                initialRows[0]!.row,
                createTranscriptRow('assistant:durable', 'conversation-durable'),
            ]),
        })

        expect(result.current.firstItemIndex).toBe(99999)
    })

    it('does not let virtuoso atBottom signals flip back into follow mode while a prepend is settling', () => {
        // Reproduces the upward-scroll regression: while reverse-infinite-scroll
        // is settling the scroll anchor for newly prepended rows, virtuoso can
        // momentarily report atBottom=true. Allowing follow mode to flip back
        // in that window snaps the viewport to the bottom mid-scroll.
        const initialOptions = createTranscriptOptions()
        const onAtBottomChange = vi.fn()
        const { result, rerender } = renderHook(
            ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) => useTranscriptVirtuoso(options),
            {
                initialProps: {
                    options: createTranscriptOptions({
                        onAtBottomChange,
                    }),
                },
            }
        )
        const autoscrollToBottom = vi.fn()
        const scrollTo = vi.fn()

        act(() => {
            result.current.virtuosoRef.current = {
                autoscrollToBottom,
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
            options: createTranscriptOptions({
                rows: buildTranscriptRenderRows([
                    createTranscriptRow('user:0', 'conversation-user-0', 'user'),
                    ...initialOptions.rows.map((row) => row.row),
                ]),
                rowStartIndexByConversationId: new Map([
                    ['conversation-user-0', 0],
                    ['conversation-user-1', 1],
                    ['conversation-assistant-2', 2],
                ]),
                onAtBottomChange,
            }),
        })

        // Virtuoso transiently reports atBottom=true mid-settling.
        act(() => {
            result.current.handleAtBottomStateChange(true)
            result.current.handleTotalListHeightChanged()
        })

        // Auto-follow MUST stay suppressed and the bottom CTA must stay visible.
        expect(autoscrollToBottom).not.toHaveBeenCalled()
        expect(scrollTo).not.toHaveBeenCalled()
        const followOutput = result.current.followOutput
        const followDecision = typeof followOutput === 'function' ? followOutput(true) : followOutput
        expect(followDecision).toBe(false)
    })

    it('lands at the resting bottom on entry instead of revealing a user turn at the header anchor', () => {
        // Entry pin is now bottom-only: when a session loads with existing history,
        // we keep `align: 'end'` and never call scrollToIndex/start-anchor reveal on
        // mount. The user-turn top anchor only fires for send-driven active turns.
        const emptyOptions = createTranscriptOptions({
            rows: [],
            rowStartIndexByConversationId: new Map(),
        })
        const scrollToIndex = vi.fn()
        const { result, rerender } = renderHook(
            ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) => useTranscriptVirtuoso(options),
            { initialProps: { options: emptyOptions } }
        )

        act(() => {
            result.current.virtuosoRef.current = {
                scrollToIndex,
                getState: vi.fn(),
            } as never
        })

        rerender({
            options: createTranscriptOptions({
                rows: buildTranscriptRenderRows([
                    createTranscriptRow('user:1', 'conversation-user-1', 'user'),
                    createTranscriptRow('assistant:2', 'conversation-assistant-2'),
                    createTranscriptRow('user:3', 'conversation-user-3', 'user'),
                    createTranscriptRow('assistant:4', 'conversation-assistant-4'),
                ]),
                rowStartIndexByConversationId: new Map([
                    ['conversation-user-1', 0],
                    ['conversation-assistant-2', 1],
                    ['conversation-user-3', 2],
                    ['conversation-assistant-4', 3],
                ]),
            }),
        })

        expect(scrollToIndex).not.toHaveBeenCalled()
        expect(result.current.alignToBottom).toBe(true)
        expect(result.current.initialTopMostItemIndex).toEqual({ index: 3, align: 'end' })
        const followOutput = result.current.followOutput
        const followDecision = typeof followOutput === 'function' ? followOutput(true) : followOutput
        expect(followDecision).toBe('auto')
    })

    it('single-flights startReached so a slow loader cannot enqueue duplicate batches', async () => {
        let resolveLoader: (() => void) | null = null
        const loader = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveLoader = resolve
                })
        )
        const options = createTranscriptOptions({
            hasMoreHistory: true,
            onLoadOlderHistory: loader,
        })
        const { result } = renderHook(() => useTranscriptVirtuoso(options))
        // Reverse-prefetch is now gated on `hasSettledInitialBottomRef`: until
        // virtuoso confirms entry-at-bottom we must not pull history, otherwise
        // an unsettled near-top mount would runaway-loop `startReached`.
        settleEntryBottom(result)

        act(() => {
            result.current.handleViewportWheelCapture({ deltaY: -32 })
            result.current.handleStartReached()
            result.current.handleStartReached()
            result.current.handleStartReached()
        })

        expect(loader).toHaveBeenCalledTimes(1)

        await act(async () => {
            resolveLoader?.()
            await Promise.resolve()
        })

        act(() => {
            result.current.handleStartReached()
        })
        expect(loader).toHaveBeenCalledTimes(2)
    })

    it('does not prefetch older history until virtuoso reports the entry has settled at bottom', () => {
        const loader = vi.fn()
        const { result } = renderHook(() =>
            useTranscriptVirtuoso(
                createTranscriptOptions({
                    hasMoreHistory: true,
                    onLoadOlderHistory: loader,
                })
            )
        )

        // Before settle: rangeChanged near the start MUST NOT pull history,
        // otherwise virtuoso's unsettled mount-time scroll can chain-fire and
        // strand the viewport near the timeline head.
        act(() => {
            result.current.handleRangeChanged({ startIndex: 100_012, endIndex: 100_020 })
            result.current.handleStartReached()
        })
        expect(loader).not.toHaveBeenCalled()

        settleEntryBottom(result)

        act(() => {
            result.current.handleViewportWheelCapture({ deltaY: -32 })
            result.current.handleRangeChanged({ startIndex: 100_012, endIndex: 100_020 })
        })
        expect(loader).toHaveBeenCalledTimes(1)
    })

    it('does not prefetch older history from rangeChanged while still resting at bottom', () => {
        const loader = vi.fn()
        const { result } = renderHook(() =>
            useTranscriptVirtuoso(
                createTranscriptOptions({
                    hasMoreHistory: true,
                    onLoadOlderHistory: loader,
                })
            )
        )
        settleEntryBottom(result)

        act(() => {
            result.current.handleRangeChanged({ startIndex: 12, endIndex: 40 })
            result.current.handleStartReached()
        })

        expect(loader).not.toHaveBeenCalled()
    })

    it('prefetches older history from rangeChanged near the loaded window start after the user leaves bottom', () => {
        const loader = vi.fn()
        const { result } = renderHook(() =>
            useTranscriptVirtuoso(
                createTranscriptOptions({
                    hasMoreHistory: true,
                    onLoadOlderHistory: loader,
                })
            )
        )
        settleEntryBottom(result)

        act(() => {
            result.current.handleViewportWheelCapture({ deltaY: -32 })
            result.current.handleRangeChanged({ startIndex: 100_012, endIndex: 100_020 })
        })

        expect(loader).toHaveBeenCalledTimes(1)
    })

    it('does not call the older-history loader when no more history is available', () => {
        const loader = vi.fn()
        const options = createTranscriptOptions({
            hasMoreHistory: false,
            onLoadOlderHistory: loader,
        })
        const { result } = renderHook(() => useTranscriptVirtuoso(options))

        act(() => {
            result.current.handleStartReached()
        })

        expect(loader).not.toHaveBeenCalled()
    })

    it('leaves follow mode when older rows are prepended so loading history does not yank the viewport to the newest message', () => {
        const initialOptions = createTranscriptOptions()
        const { result, rerender } = renderHook(
            ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) => useTranscriptVirtuoso(options),
            {
                initialProps: { options: initialOptions },
            }
        )

        const invokeFollowOutput = (isAtBottom: boolean) => {
            const followOutput = result.current.followOutput
            return typeof followOutput === 'function' ? followOutput(isAtBottom) : followOutput
        }

        expect(invokeFollowOutput(true)).toBe('auto')

        act(() => {
            rerender({
                options: createTranscriptOptions({
                    rows: buildTranscriptRenderRows([
                        createTranscriptRow('user:0', 'conversation-user-0', 'user'),
                        ...initialOptions.rows.map((row) => row.row),
                    ]),
                    rowStartIndexByConversationId: new Map([
                        ['conversation-user-0', 0],
                        ['conversation-user-1', 1],
                        ['conversation-assistant-2', 2],
                    ]),
                }),
            })
        })

        expect(invokeFollowOutput(true)).toBe(false)
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

    it('does not restore manual scroll with a direct DOM scrollTop write when the virtuoso handle cannot scroll', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const { result } = renderHook(() => useTranscriptVirtuoso(createTranscriptOptions()))
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1600,
                scrollTop: 800,
            }

            act(() => {
                result.current.setViewportRef(viewport as never)
                result.current.setVirtuosoRef({ getState: vi.fn() } as never)
                result.current.scrollToBottom()
                viewport.scrollTop = 500
                result.current.handleViewportScrollCapture()
                viewport.scrollTop = 650
                frameQueue.flushAllFrames()
            })

            expect(viewport.scrollTop).toBe(650)
        } finally {
            frameQueue.restore()
        }
    })

    it('keeps driving a single explicit-bottom transaction until a growing viewport settles at the real resting bottom', () => {
        const frameQueue = installQueuedAnimationFrameHarness()
        // `scrollToBottom` now uses `behavior: 'smooth'` and intentionally
        // skips re-issuing scrollTo for ~520ms so the native smooth animation
        // is not cancelled mid-flight (the prior implementation cancelled it
        // and produced an instant jump). The follow-up auto correction loop
        // resumes after that hold window expires. Drive `performance.now`
        // forward by one full frame each rAF tick so the hold expires inside
        // the test loop and the auto-correction path runs.
        const originalNow = performance.now
        let virtualNowMs = originalNow.call(performance)
        performance.now = () => virtualNowMs

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
                for (let frame = 0; frame < 64; frame += 1) {
                    if (frame < 18) {
                        viewport.scrollHeight += 20
                    }
                    virtualNowMs += 16
                    frameQueue.flushNextFrame()
                }
            })

            // New contract: one smooth scroll + at least one auto-correction
            // after the hold window expires. The exact count is no longer the
            // assertion — settling at the real resting bottom while the list
            // height keeps growing is.
            expect(scrollTo.mock.calls.length).toBeGreaterThanOrEqual(2)
            expect(viewport.scrollTop).toBe(viewport.scrollHeight - viewport.clientHeight)
        } finally {
            performance.now = originalNow
            frameQueue.restore()
        }
    })
})
