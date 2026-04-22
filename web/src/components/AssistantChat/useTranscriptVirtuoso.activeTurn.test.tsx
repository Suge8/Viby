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
})

describe('useTranscriptVirtuoso active turn anchoring', () => {
    it('anchors a new active user turn to the top anchor instead of starting the bottom owner', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const activeRows = buildTranscriptRenderRows([
                createTranscriptRow('user:local-1', 'conversation-user-local-1', 'user', 'local-1'),
            ])
            const onAtBottomChange = vi.fn()
            const { result, rerender } = renderHook(
                ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) =>
                    useTranscriptVirtuoso(options),
                {
                    initialProps: {
                        options: createTranscriptOptions({
                            rows: [],
                            conversationIds: [],
                            rowStartIndexByConversationId: new Map(),
                            historyJumpTargetConversationIds: [],
                            onAtBottomChange,
                        }),
                    },
                }
            )
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1080,
                scrollTop: 0,
                getBoundingClientRect: () =>
                    ({
                        top: 80,
                        bottom: 480,
                    }) as DOMRect,
                querySelectorAll: () => [],
            }
            const scrollTo = vi.fn()
            const scrollToIndex = vi.fn()

            act(() => {
                result.current.virtuosoRef.current = {
                    scrollTo,
                    scrollToIndex,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = viewport as never
            })

            rerender({
                options: createTranscriptOptions({
                    rows: activeRows,
                    conversationIds: ['conversation-user-local-1'],
                    rowStartIndexByConversationId: new Map([['conversation-user-local-1', 0]]),
                    historyJumpTargetConversationIds: ['conversation-user-local-1'],
                    activeTurnLocalId: 'local-1',
                    onAtBottomChange,
                }),
            })

            act(() => {
                frameQueue.flushAllFrames()
            })

            expect(result.current.alignToBottom).toBe(false)
            expect(scrollToIndex).toHaveBeenCalledWith({
                index: 0,
                align: 'start',
                behavior: 'auto',
            })
            expect(scrollTo).not.toHaveBeenCalled()
            expect(onAtBottomChange).toHaveBeenCalledWith(false)
        } finally {
            frameQueue.restore()
        }
    })

    it('keeps the same active turn anchored while assistant output starts streaming', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const activeRows = buildTranscriptRenderRows([
                createTranscriptRow('user:local-1', 'conversation-user-local-1', 'user', 'local-1'),
            ])
            const streamingRows = buildTranscriptRenderRows([
                createTranscriptRow('user:local-1', 'conversation-user-local-1', 'user', 'local-1'),
                createTranscriptRow('assistant:stream-1', 'conversation-assistant-stream-1'),
            ])
            const { result, rerender } = renderHook(
                ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) =>
                    useTranscriptVirtuoso(options),
                {
                    initialProps: {
                        options: createTranscriptOptions(),
                    },
                }
            )
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1080,
                scrollTop: 0,
                getBoundingClientRect: () =>
                    ({
                        top: 80,
                        bottom: 480,
                    }) as DOMRect,
                querySelectorAll: () => [],
            }
            const scrollToIndex = vi.fn()

            act(() => {
                result.current.virtuosoRef.current = {
                    scrollToIndex,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = viewport as never
            })

            rerender({
                options: createTranscriptOptions({
                    rows: activeRows,
                    conversationIds: ['conversation-user-local-1'],
                    rowStartIndexByConversationId: new Map([['conversation-user-local-1', 0]]),
                    historyJumpTargetConversationIds: ['conversation-user-local-1'],
                    activeTurnLocalId: 'local-1',
                }),
            })

            act(() => {
                frameQueue.flushAllFrames()
            })

            rerender({
                options: createTranscriptOptions({
                    rows: streamingRows,
                    conversationIds: ['conversation-user-local-1', 'conversation-assistant-stream-1'],
                    rowStartIndexByConversationId: new Map([
                        ['conversation-user-local-1', 0],
                        ['conversation-assistant-stream-1', 1],
                    ]),
                    historyJumpTargetConversationIds: ['conversation-user-local-1'],
                    activeTurnLocalId: 'local-1',
                }),
            })

            rerender({
                options: createTranscriptOptions({
                    rows: streamingRows,
                    conversationIds: ['conversation-user-local-1', 'conversation-assistant-stream-1'],
                    rowStartIndexByConversationId: new Map([
                        ['conversation-user-local-1', 0],
                        ['conversation-assistant-stream-1', 1],
                    ]),
                    historyJumpTargetConversationIds: ['conversation-user-local-1'],
                    activeTurnLocalId: null,
                }),
            })

            expect(scrollToIndex).toHaveBeenCalledTimes(1)
            expect(result.current.alignToBottom).toBe(false)
        } finally {
            frameQueue.restore()
        }
    })

    it('lets the bottom CTA override an active turn anchor through the explicit bottom owner', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const activeRows = buildTranscriptRenderRows([
                createTranscriptRow('user:local-1', 'conversation-user-local-1', 'user', 'local-1'),
            ])
            const { result, rerender } = renderHook(
                ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) =>
                    useTranscriptVirtuoso(options),
                {
                    initialProps: {
                        options: createTranscriptOptions(),
                    },
                }
            )
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1080,
                scrollTop: 0,
                querySelectorAll: () => [],
            }
            const scrollTo = vi.fn(() => {
                viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight
            })
            const scrollToIndex = vi.fn()

            act(() => {
                result.current.virtuosoRef.current = {
                    scrollTo,
                    scrollToIndex,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = viewport as never
            })

            rerender({
                options: createTranscriptOptions({
                    rows: activeRows,
                    conversationIds: ['conversation-user-local-1'],
                    rowStartIndexByConversationId: new Map([['conversation-user-local-1', 0]]),
                    historyJumpTargetConversationIds: ['conversation-user-local-1'],
                    activeTurnLocalId: 'local-1',
                }),
            })

            act(() => {
                frameQueue.flushAllFrames()
            })

            act(() => {
                result.current.scrollToBottom()
                frameQueue.flushAllFrames()
            })

            expect(result.current.alignToBottom).toBe(true)
            expect(scrollTo).toHaveBeenCalled()
            expect(scrollToIndex).toHaveBeenCalledTimes(1)
        } finally {
            frameQueue.restore()
        }
    })

    it('does not leak a bottom override from one active turn into the next send', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const firstTurnRows = buildTranscriptRenderRows([
                createTranscriptRow('user:local-1', 'conversation-user-local-1', 'user', 'local-1'),
            ])
            const secondTurnRows = buildTranscriptRenderRows([
                createTranscriptRow('user:local-1', 'conversation-user-local-1', 'user', 'local-1'),
                createTranscriptRow('assistant:2', 'conversation-assistant-2'),
                createTranscriptRow('user:local-2', 'conversation-user-local-2', 'user', 'local-2'),
            ])
            const { result, rerender } = renderHook(
                ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) =>
                    useTranscriptVirtuoso(options),
                {
                    initialProps: {
                        options: createTranscriptOptions(),
                    },
                }
            )
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1280,
                scrollTop: 0,
                querySelectorAll: () => [],
            }
            const scrollTo = vi.fn(() => {
                viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight
            })
            const scrollToIndex = vi.fn()

            act(() => {
                result.current.virtuosoRef.current = {
                    scrollTo,
                    scrollToIndex,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = viewport as never
            })

            rerender({
                options: createTranscriptOptions({
                    rows: firstTurnRows,
                    conversationIds: ['conversation-user-local-1'],
                    rowStartIndexByConversationId: new Map([['conversation-user-local-1', 0]]),
                    historyJumpTargetConversationIds: ['conversation-user-local-1'],
                    activeTurnLocalId: 'local-1',
                }),
            })
            act(() => {
                frameQueue.flushAllFrames()
                result.current.scrollToBottom()
                frameQueue.flushAllFrames()
            })
            scrollTo.mockClear()
            scrollToIndex.mockClear()

            rerender({
                options: createTranscriptOptions({
                    rows: secondTurnRows,
                    conversationIds: [
                        'conversation-user-local-1',
                        'conversation-assistant-2',
                        'conversation-user-local-2',
                    ],
                    rowStartIndexByConversationId: new Map([
                        ['conversation-user-local-1', 0],
                        ['conversation-assistant-2', 1],
                        ['conversation-user-local-2', 2],
                    ]),
                    historyJumpTargetConversationIds: ['conversation-user-local-1', 'conversation-user-local-2'],
                    activeTurnLocalId: null,
                }),
            })
            rerender({
                options: createTranscriptOptions({
                    rows: secondTurnRows,
                    conversationIds: [
                        'conversation-user-local-1',
                        'conversation-assistant-2',
                        'conversation-user-local-2',
                    ],
                    rowStartIndexByConversationId: new Map([
                        ['conversation-user-local-1', 0],
                        ['conversation-assistant-2', 1],
                        ['conversation-user-local-2', 2],
                    ]),
                    historyJumpTargetConversationIds: ['conversation-user-local-1', 'conversation-user-local-2'],
                    activeTurnLocalId: 'local-2',
                }),
            })
            act(() => {
                frameQueue.flushAllFrames()
            })

            expect(result.current.alignToBottom).toBe(false)
            expect(scrollToIndex).toHaveBeenCalledWith({
                index: 2,
                align: 'start',
                behavior: 'auto',
            })
            expect(scrollTo).not.toHaveBeenCalled()
        } finally {
            frameQueue.restore()
        }
    })

    it('clears a completed active turn anchor when the user explicitly returns to bottom', () => {
        const frameQueue = installQueuedAnimationFrameHarness()

        try {
            const activeRows = buildTranscriptRenderRows([
                createTranscriptRow('user:local-1', 'conversation-user-local-1', 'user', 'local-1'),
                createTranscriptRow('assistant:2', 'conversation-assistant-2'),
            ])
            const { result, rerender } = renderHook(
                ({ options }: { options: ReturnType<typeof createTranscriptOptions> }) =>
                    useTranscriptVirtuoso(options),
                {
                    initialProps: {
                        options: createTranscriptOptions(),
                    },
                }
            )
            const viewport = {
                clientHeight: 400,
                scrollHeight: 1280,
                scrollTop: 0,
                querySelectorAll: () => [],
            }
            const scrollTo = vi.fn(() => {
                viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight
            })
            const scrollToIndex = vi.fn()

            act(() => {
                result.current.virtuosoRef.current = {
                    scrollTo,
                    scrollToIndex,
                    getState: vi.fn(),
                } as never
                result.current.viewportRef.current = viewport as never
            })

            rerender({
                options: createTranscriptOptions({
                    rows: activeRows,
                    conversationIds: ['conversation-user-local-1', 'conversation-assistant-2'],
                    rowStartIndexByConversationId: new Map([
                        ['conversation-user-local-1', 0],
                        ['conversation-assistant-2', 1],
                    ]),
                    historyJumpTargetConversationIds: ['conversation-user-local-1'],
                    activeTurnLocalId: 'local-1',
                }),
            })
            act(() => {
                frameQueue.flushAllFrames()
            })

            rerender({
                options: createTranscriptOptions({
                    rows: activeRows,
                    conversationIds: ['conversation-user-local-1', 'conversation-assistant-2'],
                    rowStartIndexByConversationId: new Map([
                        ['conversation-user-local-1', 0],
                        ['conversation-assistant-2', 1],
                    ]),
                    historyJumpTargetConversationIds: ['conversation-user-local-1'],
                    activeTurnLocalId: null,
                }),
            })
            expect(result.current.alignToBottom).toBe(false)

            act(() => {
                result.current.scrollToBottom()
                frameQueue.flushAllFrames()
            })

            expect(result.current.alignToBottom).toBe(true)
            expect(scrollTo).toHaveBeenCalled()
        } finally {
            frameQueue.restore()
        }
    })
})
