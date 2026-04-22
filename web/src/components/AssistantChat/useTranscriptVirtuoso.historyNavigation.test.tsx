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
    type: TranscriptRow['type'] = 'assistant-text'
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
                localId: null,
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
    document.documentElement.style.removeProperty('--chat-header-visual-clearance')
})

describe('useTranscriptVirtuoso history navigation', () => {
    it('uses the latest prepended history window when a history jump settles after load-more', async () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            document.documentElement.style.setProperty('--chat-header-anchor-space', '72px')
            const initialRows = buildTranscriptRenderRows([
                createTranscriptRow('user:1', 'conversation-user-1', 'user'),
                createTranscriptRow('assistant:2', 'conversation-assistant-2'),
                createTranscriptRow('user:3', 'conversation-user-3', 'user'),
                createTranscriptRow('assistant:4', 'conversation-assistant-4'),
            ])
            const { result, rerender } = renderHook(
                ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) =>
                    useTranscriptVirtuoso(options),
                {
                    initialProps: {
                        options: createTranscriptOptions({
                            rows: initialRows,
                            conversationIds: [
                                'conversation-user-1',
                                'conversation-assistant-2',
                                'conversation-user-3',
                                'conversation-assistant-4',
                            ],
                            rowStartIndexByConversationId: new Map([
                                ['conversation-user-1', 0],
                                ['conversation-assistant-2', 1],
                                ['conversation-user-3', 2],
                                ['conversation-assistant-4', 3],
                            ]),
                            historyJumpTargetConversationIds: ['conversation-user-1', 'conversation-user-3'],
                            hasMoreMessages: true,
                        }),
                    },
                }
            )

            rerender({
                options: createTranscriptOptions({
                    rows: buildTranscriptRenderRows([
                        createTranscriptRow('user:0', 'conversation-user-0', 'user'),
                        ...initialRows.map((row) => row.row),
                    ]),
                    conversationIds: [
                        'conversation-user-0',
                        'conversation-user-1',
                        'conversation-assistant-2',
                        'conversation-user-3',
                        'conversation-assistant-4',
                    ],
                    rowStartIndexByConversationId: new Map([
                        ['conversation-user-0', 0],
                        ['conversation-user-1', 1],
                        ['conversation-assistant-2', 2],
                        ['conversation-user-3', 3],
                        ['conversation-assistant-4', 4],
                    ]),
                    historyJumpTargetConversationIds: [
                        'conversation-user-0',
                        'conversation-user-1',
                        'conversation-user-3',
                    ],
                    hasMoreMessages: true,
                }),
            })

            expect(result.current.firstItemIndex).toBe(99999)

            let targetRowTop = 96
            let visibleRows = [
                {
                    dataset: { conversationId: 'conversation-user-3', rowIndex: '100002' },
                    getBoundingClientRect: () =>
                        ({
                            top: 90,
                            bottom: 310,
                        }) as DOMRect,
                },
                {
                    dataset: { conversationId: 'conversation-assistant-4', rowIndex: '100003' },
                    getBoundingClientRect: () =>
                        ({
                            top: 322,
                            bottom: 402,
                        }) as DOMRect,
                },
            ] as unknown as NodeListOf<HTMLElement>
            const viewport = {
                scrollTop: 1000,
                querySelectorAll: () => visibleRows,
                getBoundingClientRect: () =>
                    ({
                        top: 80,
                        bottom: 480,
                    }) as DOMRect,
            }
            const scrollToIndex = vi.fn(() => {
                visibleRows = [
                    {
                        dataset: { conversationId: 'conversation-user-1', rowIndex: '100000' },
                        getBoundingClientRect: () =>
                            ({
                                top: targetRowTop,
                                bottom: targetRowTop + 172,
                            }) as DOMRect,
                    },
                ] as unknown as NodeListOf<HTMLElement>
            })
            const scrollTo = vi.fn(({ top }: { top: number }) => {
                targetRowTop -= top - viewport.scrollTop
                viewport.scrollTop = top
            })

            act(() => {
                result.current.virtuosoRef.current = {
                    scrollToIndex,
                    scrollTo,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = viewport as never
                result.current.handleRangeChanged({
                    startIndex: 100003,
                    endIndex: 100003,
                })
            })

            await act(async () => {
                await result.current.handleHistoryControlClick()
                frameQueue.flushAllFrames()
            })

            expect(scrollToIndex).toHaveBeenCalledWith({
                index: 1,
                align: 'start',
                behavior: 'auto',
            })
            expect(scrollTo).toHaveBeenCalledWith({
                top: 944,
                behavior: 'auto',
            })
        } finally {
            frameQueue.restore()
        }
    })

    it('jumps directly to the previous visible user conversation when it is already loaded', async () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            document.documentElement.style.setProperty('--chat-header-anchor-space', '72px')
            const rows = buildTranscriptRenderRows([
                createTranscriptRow('user:1', 'conversation-user-1', 'user'),
                createTranscriptRow('assistant:2', 'conversation-assistant-2'),
                createTranscriptRow('user:3', 'conversation-user-3', 'user'),
                createTranscriptRow('assistant:4', 'conversation-assistant-4'),
            ])
            const options = createTranscriptOptions({
                rows,
                conversationIds: [
                    'conversation-user-1',
                    'conversation-assistant-2',
                    'conversation-user-3',
                    'conversation-assistant-4',
                ],
                rowStartIndexByConversationId: new Map([
                    ['conversation-user-1', 0],
                    ['conversation-assistant-2', 1],
                    ['conversation-user-3', 2],
                    ['conversation-assistant-4', 3],
                ]),
                historyJumpTargetConversationIds: ['conversation-user-1', 'conversation-user-3'],
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            let rowTop = 90
            let visibleRows = [] as unknown as NodeListOf<HTMLElement>
            const viewport = {
                scrollTop: 1000,
                getBoundingClientRect: () =>
                    ({
                        top: 80,
                        bottom: 480,
                    }) as DOMRect,
                querySelectorAll: () => visibleRows,
            }
            const scrollToIndex = vi.fn(() => {
                visibleRows = [
                    {
                        dataset: { conversationId: 'conversation-user-3', rowIndex: '100002' },
                        getBoundingClientRect: () =>
                            ({
                                top: rowTop,
                                bottom: rowTop + 220,
                            }) as DOMRect,
                    },
                ] as unknown as NodeListOf<HTMLElement>
            })
            const scrollTo = vi.fn(({ top }: { top: number }) => {
                rowTop -= top - viewport.scrollTop
                viewport.scrollTop = top
            })

            act(() => {
                result.current.virtuosoRef.current = {
                    scrollToIndex,
                    scrollTo,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = viewport as never
                result.current.handleRangeChanged({
                    startIndex: 100003,
                    endIndex: 100003,
                })
            })

            await act(async () => {
                await result.current.handleHistoryControlClick()
                frameQueue.flushAllFrames()
            })

            expect(options.onAtBottomChange).toHaveBeenCalledWith(false)
            expect(scrollToIndex).toHaveBeenCalledWith({
                index: 2,
                align: 'start',
                behavior: 'auto',
            })
            expect(scrollTo).toHaveBeenCalledWith({
                top: 938,
                behavior: 'auto',
            })
        } finally {
            frameQueue.restore()
        }
    })

    it('uses the visible DOM row as the previous-user history cursor when the rendered top row and range diverge', async () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            document.documentElement.style.setProperty('--chat-header-anchor-space', '72px')
            const rows = buildTranscriptRenderRows([
                createTranscriptRow('user:1', 'conversation-user-1', 'user'),
                createTranscriptRow('assistant:2', 'conversation-assistant-2'),
                createTranscriptRow('user:3', 'conversation-user-3', 'user'),
                createTranscriptRow('assistant:4', 'conversation-assistant-4'),
            ])
            const options = createTranscriptOptions({
                rows,
                conversationIds: [
                    'conversation-user-1',
                    'conversation-assistant-2',
                    'conversation-user-3',
                    'conversation-assistant-4',
                ],
                rowStartIndexByConversationId: new Map([
                    ['conversation-user-1', 0],
                    ['conversation-assistant-2', 1],
                    ['conversation-user-3', 2],
                    ['conversation-assistant-4', 3],
                ]),
                historyJumpTargetConversationIds: ['conversation-user-1', 'conversation-user-3'],
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            let targetRowTop = 96
            const viewport = {
                scrollTop: 1000,
                querySelectorAll: () => visibleRows,
                getBoundingClientRect: () =>
                    ({
                        top: 80,
                        bottom: 480,
                    }) as DOMRect,
            }
            let visibleRows = [
                {
                    dataset: { conversationId: 'conversation-user-3', rowIndex: '100002' },
                    getBoundingClientRect: () =>
                        ({
                            top: 90,
                            bottom: 310,
                        }) as DOMRect,
                },
                {
                    dataset: { conversationId: 'conversation-assistant-4', rowIndex: '100003' },
                    getBoundingClientRect: () =>
                        ({
                            top: 322,
                            bottom: 402,
                        }) as DOMRect,
                },
            ] as unknown as NodeListOf<HTMLElement>
            const scrollToIndex = vi.fn(() => {
                visibleRows = [
                    {
                        dataset: { conversationId: 'conversation-user-1', rowIndex: '100000' },
                        getBoundingClientRect: () =>
                            ({
                                top: targetRowTop,
                                bottom: targetRowTop + 172,
                            }) as DOMRect,
                    },
                ] as unknown as NodeListOf<HTMLElement>
            })
            const scrollTo = vi.fn(({ top }: { top: number }) => {
                targetRowTop -= top - viewport.scrollTop
                viewport.scrollTop = top
            })

            act(() => {
                result.current.virtuosoRef.current = {
                    scrollToIndex,
                    scrollTo,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = viewport as never
                result.current.handleRangeChanged({
                    startIndex: 100003,
                    endIndex: 100003,
                })
            })

            await act(async () => {
                await result.current.handleHistoryControlClick()
                frameQueue.flushAllFrames()
            })

            expect(scrollToIndex).toHaveBeenCalledWith({
                index: 0,
                align: 'start',
                behavior: 'auto',
            })
            expect(scrollTo).toHaveBeenCalledWith({
                top: 944,
                behavior: 'auto',
            })
        } finally {
            frameQueue.restore()
        }
    })

    it('cancels a pending top-anchor transaction as soon as a manual wheel gesture claims the viewport', async () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            document.documentElement.style.setProperty('--chat-header-anchor-space', '72px')
            document.documentElement.style.setProperty('--chat-header-visual-clearance', '8px')
            const rows = buildTranscriptRenderRows([
                createTranscriptRow('user:1', 'conversation-user-1', 'user'),
                createTranscriptRow('assistant:2', 'conversation-assistant-2'),
                createTranscriptRow('user:3', 'conversation-user-3', 'user'),
                createTranscriptRow('assistant:4', 'conversation-assistant-4'),
            ])
            const options = createTranscriptOptions({
                rows,
                conversationIds: [
                    'conversation-user-1',
                    'conversation-assistant-2',
                    'conversation-user-3',
                    'conversation-assistant-4',
                ],
                rowStartIndexByConversationId: new Map([
                    ['conversation-user-1', 0],
                    ['conversation-assistant-2', 1],
                    ['conversation-user-3', 2],
                    ['conversation-assistant-4', 3],
                ]),
                historyJumpTargetConversationIds: ['conversation-user-1', 'conversation-user-3'],
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            let rowTop = 124
            let visibleRows = [] as unknown as NodeListOf<HTMLElement>
            const viewport = {
                scrollTop: 1000,
                getBoundingClientRect: () =>
                    ({
                        top: 80,
                        bottom: 480,
                    }) as DOMRect,
                querySelectorAll: () => visibleRows,
            }
            const scrollToIndex = vi.fn(() => {
                visibleRows = [
                    {
                        dataset: { conversationId: 'conversation-user-3', rowIndex: '100002' },
                        getBoundingClientRect: () =>
                            ({
                                top: rowTop,
                                bottom: rowTop + 172,
                            }) as DOMRect,
                    },
                ] as unknown as NodeListOf<HTMLElement>
            })
            const scrollTo = vi.fn(({ top }: { top: number }) => {
                viewport.scrollTop = top
                rowTop = 112
            })

            act(() => {
                result.current.virtuosoRef.current = {
                    scrollToIndex,
                    scrollTo,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = viewport as never
                result.current.handleRangeChanged({
                    startIndex: 100003,
                    endIndex: 100003,
                })
            })

            await act(async () => {
                await result.current.handleHistoryControlClick()
            })

            act(() => {
                frameQueue.flushNextFrame()
            })

            const scrollToCallCountBeforeManualWheel = scrollTo.mock.calls.length
            act(() => {
                result.current.handleViewportWheelCapture({ deltaY: -120 })
                frameQueue.flushAllFrames()
            })

            expect(scrollToIndex).toHaveBeenCalledTimes(1)
            expect(scrollTo.mock.calls.length).toBe(scrollToCallCountBeforeManualWheel)
        } finally {
            frameQueue.restore()
        }
    })

    it('ignores stale atBottom callbacks while a history jump owns the viewport', async () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            document.documentElement.style.setProperty('--chat-header-anchor-space', '72px')
            const rows = buildTranscriptRenderRows([
                createTranscriptRow('user:1', 'conversation-user-1', 'user'),
                createTranscriptRow('assistant:2', 'conversation-assistant-2'),
                createTranscriptRow('user:3', 'conversation-user-3', 'user'),
                createTranscriptRow('assistant:4', 'conversation-assistant-4'),
            ])
            const options = createTranscriptOptions({
                rows,
                conversationIds: [
                    'conversation-user-1',
                    'conversation-assistant-2',
                    'conversation-user-3',
                    'conversation-assistant-4',
                ],
                rowStartIndexByConversationId: new Map([
                    ['conversation-user-1', 0],
                    ['conversation-assistant-2', 1],
                    ['conversation-user-3', 2],
                    ['conversation-assistant-4', 3],
                ]),
                historyJumpTargetConversationIds: ['conversation-user-1', 'conversation-user-3'],
                onAtBottomChange: vi.fn(),
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            let rowTop = 96
            let visibleRows = [
                {
                    dataset: { conversationId: 'conversation-user-3', rowIndex: '100002' },
                    getBoundingClientRect: () =>
                        ({
                            top: 92,
                            bottom: 312,
                        }) as DOMRect,
                },
            ] as unknown as NodeListOf<HTMLElement>
            const viewport = {
                scrollTop: 1000,
                getBoundingClientRect: () =>
                    ({
                        top: 80,
                        bottom: 480,
                    }) as DOMRect,
                querySelectorAll: () => visibleRows,
            }
            const autoscrollToBottom = vi.fn()
            const scrollToIndex = vi.fn(() => {
                visibleRows = [
                    {
                        dataset: { conversationId: 'conversation-user-1', rowIndex: '100000' },
                        getBoundingClientRect: () =>
                            ({
                                top: rowTop,
                                bottom: rowTop + 172,
                            }) as DOMRect,
                    },
                ] as unknown as NodeListOf<HTMLElement>
            })
            const scrollTo = vi.fn(({ top }: { top: number }) => {
                rowTop -= top - viewport.scrollTop
                viewport.scrollTop = top
            })

            act(() => {
                result.current.virtuosoRef.current = {
                    autoscrollToBottom,
                    scrollToIndex,
                    scrollTo,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = viewport as never
                result.current.handleRangeChanged({
                    startIndex: 100003,
                    endIndex: 100003,
                })
            })

            await act(async () => {
                await result.current.handleHistoryControlClick()
                result.current.handleAtBottomStateChange(true)
                result.current.handleAtBottomStateChange(false)
                frameQueue.flushAllFrames()
            })

            expect(options.onAtBottomChange).toHaveBeenCalledWith(false)
            expect(autoscrollToBottom).not.toHaveBeenCalled()
        } finally {
            frameQueue.restore()
        }
    })

    it('ignores a late atBottom=true callback after the history jump already settled away from bottom', async () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            document.documentElement.style.setProperty('--chat-header-anchor-space', '72px')
            const options = createTranscriptOptions({
                rows: buildTranscriptRenderRows([
                    createTranscriptRow('user:1', 'conversation-user-1', 'user'),
                    createTranscriptRow('assistant:2', 'conversation-assistant-2'),
                    createTranscriptRow('user:3', 'conversation-user-3', 'user'),
                    createTranscriptRow('assistant:4', 'conversation-assistant-4'),
                ]),
                conversationIds: [
                    'conversation-user-1',
                    'conversation-assistant-2',
                    'conversation-user-3',
                    'conversation-assistant-4',
                ],
                rowStartIndexByConversationId: new Map([
                    ['conversation-user-1', 0],
                    ['conversation-assistant-2', 1],
                    ['conversation-user-3', 2],
                    ['conversation-assistant-4', 3],
                ]),
                historyJumpTargetConversationIds: ['conversation-user-1', 'conversation-user-3'],
                onAtBottomChange: vi.fn(),
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            let rowTop = 96
            let visibleRows = [
                {
                    dataset: { conversationId: 'conversation-user-3', rowIndex: '100002' },
                    getBoundingClientRect: () =>
                        ({
                            top: 92,
                            bottom: 312,
                        }) as DOMRect,
                },
            ] as unknown as NodeListOf<HTMLElement>
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1600,
                scrollTop: 1000,
                getBoundingClientRect: () =>
                    ({
                        top: 80,
                        bottom: 480,
                    }) as DOMRect,
                querySelectorAll: () => visibleRows,
            }
            const autoscrollToBottom = vi.fn()
            const scrollToIndex = vi.fn(() => {
                visibleRows = [
                    {
                        dataset: { conversationId: 'conversation-user-1', rowIndex: '100000' },
                        getBoundingClientRect: () =>
                            ({
                                top: rowTop,
                                bottom: rowTop + 172,
                            }) as DOMRect,
                    },
                ] as unknown as NodeListOf<HTMLElement>
            })
            const scrollTo = vi.fn(({ top }: { top: number }) => {
                rowTop -= top - viewport.scrollTop
                viewport.scrollTop = top
            })

            act(() => {
                result.current.virtuosoRef.current = {
                    autoscrollToBottom,
                    scrollToIndex,
                    scrollTo,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = viewport as never
                result.current.handleRangeChanged({
                    startIndex: 100003,
                    endIndex: 100003,
                })
            })

            await act(async () => {
                await result.current.handleHistoryControlClick()
                frameQueue.flushAllFrames()
            })

            const autoscrollCallCountBeforeLateCallback = autoscrollToBottom.mock.calls.length
            act(() => {
                result.current.handleAtBottomStateChange(true)
                result.current.handleTotalListHeightChanged()
                frameQueue.flushAllFrames()
            })

            expect(options.onAtBottomChange).toHaveBeenCalledWith(false)
            expect(autoscrollToBottom.mock.calls.length).toBe(autoscrollCallCountBeforeLateCallback)
        } finally {
            frameQueue.restore()
        }
    })

    it('ignores a second history click while the current top-anchor transaction still owns the viewport', async () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            document.documentElement.style.setProperty('--chat-header-anchor-space', '72px')
            const options = createTranscriptOptions({
                rows: buildTranscriptRenderRows([
                    createTranscriptRow('user:1', 'conversation-user-1', 'user'),
                    createTranscriptRow('assistant:2', 'conversation-assistant-2'),
                    createTranscriptRow('user:3', 'conversation-user-3', 'user'),
                    createTranscriptRow('assistant:4', 'conversation-assistant-4'),
                ]),
                conversationIds: [
                    'conversation-user-1',
                    'conversation-assistant-2',
                    'conversation-user-3',
                    'conversation-assistant-4',
                ],
                rowStartIndexByConversationId: new Map([
                    ['conversation-user-1', 0],
                    ['conversation-assistant-2', 1],
                    ['conversation-user-3', 2],
                    ['conversation-assistant-4', 3],
                ]),
                historyJumpTargetConversationIds: ['conversation-user-1', 'conversation-user-3'],
            })
            const { result } = renderHook(() => useTranscriptVirtuoso(options))
            let rowTop = 108
            const visibleRows = [
                {
                    dataset: { conversationId: 'conversation-assistant-4', rowIndex: '100003' },
                    getBoundingClientRect: () =>
                        ({
                            top: 166,
                            bottom: 280,
                        }) as DOMRect,
                },
                {
                    dataset: {
                        conversationId: 'conversation-user-3',
                        historyJumpTarget: 'true',
                        rowIndex: '100002',
                    },
                    getBoundingClientRect: () =>
                        ({
                            top: rowTop,
                            bottom: rowTop + 78,
                        }) as DOMRect,
                },
            ] as unknown as NodeListOf<HTMLElement>
            const viewport = {
                scrollTop: 1000,
                getBoundingClientRect: () =>
                    ({
                        top: 80,
                        bottom: 480,
                    }) as DOMRect,
                querySelectorAll: (selector: string) => {
                    if (selector.includes('data-history-jump-target')) {
                        return [visibleRows[1]] as unknown as NodeListOf<HTMLElement>
                    }
                    return visibleRows
                },
            }
            const scrollToIndex = vi.fn(() => {
                rowTop = 96
            })
            const scrollTo = vi.fn(({ top }: { top: number }) => {
                rowTop -= top - viewport.scrollTop
                viewport.scrollTop = top
            })

            act(() => {
                result.current.virtuosoRef.current = {
                    scrollToIndex,
                    scrollTo,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = viewport as never
            })

            await act(async () => {
                await result.current.handleHistoryControlClick()
                await result.current.handleHistoryControlClick()
            })

            expect(scrollToIndex).toHaveBeenCalledTimes(1)

            act(() => {
                frameQueue.flushAllFrames()
            })
        } finally {
            frameQueue.restore()
        }
    })

    it('clears the loading state when loading older history returns no previous-user page', async () => {
        const options = createTranscriptOptions({
            rows: buildTranscriptRenderRows([
                createTranscriptRow('user:11', 'conversation-user-11', 'user'),
                createTranscriptRow('assistant:12', 'conversation-assistant-12'),
            ]),
            conversationIds: ['conversation-user-11', 'conversation-assistant-12'],
            rowStartIndexByConversationId: new Map([
                ['conversation-user-11', 0],
                ['conversation-assistant-12', 1],
            ]),
            historyJumpTargetConversationIds: ['conversation-user-9'],
            hasMoreMessages: true,
            onLoadHistoryUntilPreviousUser: vi.fn(async () => ({ didLoadOlderMessages: false })),
        })
        const { result } = renderHook(() => useTranscriptVirtuoso(options))
        const viewport = {
            getBoundingClientRect: () =>
                ({
                    top: 80,
                    bottom: 480,
                }) as DOMRect,
            querySelectorAll: () =>
                [
                    {
                        dataset: { conversationId: 'conversation-assistant-12', rowIndex: '100001' },
                        getBoundingClientRect: () =>
                            ({
                                top: 200,
                                bottom: 320,
                            }) as DOMRect,
                    },
                ] as unknown as NodeListOf<HTMLElement>,
        }

        act(() => {
            result.current.viewportRef.current = viewport as never
        })

        await act(async () => {
            await result.current.handleHistoryControlClick()
        })

        expect(options.onLoadHistoryUntilPreviousUser).toHaveBeenCalledTimes(1)
        expect(result.current.isHistoryActionPending).toBe(false)
    })
})
