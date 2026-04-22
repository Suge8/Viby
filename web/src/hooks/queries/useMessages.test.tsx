import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LoadMoreMessagesResult } from '@/lib/message-window-store'
import type { MessageWindowState } from '@/lib/messageWindowStoreCore'
import type { DecryptedMessage } from '@/types/api'
import { useMessages } from './useMessages'

function createEmptyState(): MessageWindowState {
    return {
        sessionId: 'session-1',
        messages: [],
        pending: [],
        pendingCount: 0,
        hasLoadedLatest: false,
        hasMore: false,
        oldestSeq: null,
        newestSeq: null,
        isLoading: false,
        isLoadingMore: false,
        warning: null,
        atBottom: true,
        messagesVersion: 0,
        pendingReply: null,
        stream: null,
        streamVersion: 0,
        restoredFromWarmSnapshot: false,
    }
}

let currentState: MessageWindowState = createEmptyState()
const listeners = new Set<() => void>()

const storeHarness = vi.hoisted(() => ({
    ensureLatestMessagesLoadedMock: vi.fn(async () => undefined),
    fetchLatestMessagesMock: vi.fn(async () => undefined),
    fetchOlderMessagesUntilPreviousUserMock: vi.fn<() => Promise<LoadMoreMessagesResult>>(async () => ({
        didLoadOlderMessages: false,
    })),
    readSessionViewRuntimeLoadMock: vi.fn<(sessionId: string) => Promise<unknown> | null>(() => null),
}))

const readyMessage: DecryptedMessage = {
    id: 'message-1',
    seq: 1,
    localId: null,
    createdAt: 1_000,
    content: {
        role: 'agent',
        content: {
            type: 'text',
            text: 'ready',
        },
    },
}

const apiStub = {} as never
const olderMessage: DecryptedMessage = {
    id: 'message-0',
    seq: 0,
    localId: null,
    createdAt: 500,
    content: {
        role: 'user',
        content: {
            type: 'text',
            text: 'older',
        },
    },
}

const flushMessageWindowSnapshotMock = vi.fn((_sessionId?: string) => undefined)
const flushPendingMessagesMock = vi.fn((_sessionId?: string) => false)
const setAtBottomMock = vi.fn((_sessionId?: string, _atBottom?: boolean) => undefined)
function notifyListeners(): void {
    for (const listener of listeners) {
        listener()
    }
}

vi.mock('@/lib/messageWindowStoreCore', () => ({
    flushMessageWindowSnapshot: (sessionId: string) => flushMessageWindowSnapshotMock(sessionId),
    flushPendingMessages: (sessionId: string) => flushPendingMessagesMock(sessionId),
    getMessageWindowState: vi.fn(() => currentState),
    subscribeMessageWindow: vi.fn((_sessionId: string, listener: () => void) => {
        listeners.add(listener)
        return () => {
            listeners.delete(listener)
        }
    }),
    setAtBottom: (sessionId: string, atBottom: boolean) => setAtBottomMock(sessionId, atBottom),
}))

storeHarness.ensureLatestMessagesLoadedMock.mockImplementation(async () => {
    currentState = {
        ...currentState,
        hasLoadedLatest: true,
        messages: [readyMessage],
        messagesVersion: 1,
        newestSeq: 1,
        oldestSeq: 1,
    }
    notifyListeners()
})
storeHarness.fetchOlderMessagesUntilPreviousUserMock.mockImplementation(async () => {
    currentState = {
        ...currentState,
        messages: [olderMessage, ...currentState.messages],
        messagesVersion: currentState.messagesVersion + 1,
        oldestSeq: 0,
        hasMore: false,
    }
    notifyListeners()
    return { didLoadOlderMessages: true as const }
})

vi.mock('@/lib/message-window-store', () => ({
    ensureLatestMessagesLoaded: storeHarness.ensureLatestMessagesLoadedMock,
    fetchLatestMessages: storeHarness.fetchLatestMessagesMock,
    fetchOlderMessagesUntilPreviousUser: storeHarness.fetchOlderMessagesUntilPreviousUserMock,
}))

vi.mock('@/hooks/queries/sessionViewRuntime', () => ({
    readSessionViewRuntimeLoad: (sessionId: string) => storeHarness.readSessionViewRuntimeLoadMock(sessionId),
}))

describe('useMessages', () => {
    afterEach(() => {
        currentState = createEmptyState()
        listeners.clear()
        flushMessageWindowSnapshotMock.mockReset()
        flushPendingMessagesMock.mockClear()
        setAtBottomMock.mockReset()
        storeHarness.ensureLatestMessagesLoadedMock.mockClear()
        storeHarness.fetchLatestMessagesMock.mockClear()
        storeHarness.fetchOlderMessagesUntilPreviousUserMock.mockClear()
        storeHarness.readSessionViewRuntimeLoadMock.mockReset()
        storeHarness.readSessionViewRuntimeLoadMock.mockReturnValue(null)
    })

    it('reconciles the latest snapshot after async load even when the external store misses the notify', async () => {
        let resolveLatestLoad!: () => void
        storeHarness.ensureLatestMessagesLoadedMock.mockImplementationOnce(
            () =>
                new Promise<undefined>((resolve) => {
                    resolveLatestLoad = () => {
                        currentState = {
                            ...currentState,
                            hasLoadedLatest: true,
                            messages: [readyMessage],
                            messagesVersion: 1,
                            newestSeq: 1,
                            oldestSeq: 1,
                        }
                        notifyListeners()
                        resolve(undefined)
                    }
                })
        )
        const { result } = renderHook(() => useMessages(apiStub, 'session-1'))

        expect(result.current.hasLoadedLatest).toBe(false)

        resolveLatestLoad()

        await waitFor(() => {
            expect(result.current.hasLoadedLatest).toBe(true)
        })

        expect(result.current.messages).toHaveLength(1)
        expect(storeHarness.ensureLatestMessagesLoadedMock).toHaveBeenCalledWith(apiStub, 'session-1')
    })

    it('waits for the in-flight session view owner before loading latest messages', async () => {
        let resolveSessionViewLoad!: () => void
        const pendingSessionViewLoad = new Promise<void>((resolve) => {
            resolveSessionViewLoad = resolve
        })
        storeHarness.readSessionViewRuntimeLoadMock.mockReturnValueOnce(pendingSessionViewLoad)

        renderHook(() => useMessages(apiStub, 'session-1'))

        expect(storeHarness.ensureLatestMessagesLoadedMock).not.toHaveBeenCalled()

        resolveSessionViewLoad()

        await waitFor(() => {
            expect(storeHarness.ensureLatestMessagesLoadedMock).toHaveBeenCalledWith(apiStub, 'session-1')
        })
    })

    it('reconciles the latest snapshot after previous-user history expansion even when the external store misses the notify', async () => {
        currentState = {
            ...createEmptyState(),
            hasLoadedLatest: true,
            hasMore: true,
            messages: [readyMessage],
            messagesVersion: 1,
            oldestSeq: 1,
            newestSeq: 1,
        }

        const { result } = renderHook(() => useMessages(apiStub, 'session-1'))

        await act(async () => {
            await result.current.loadHistoryUntilPreviousUser()
        })

        expect(storeHarness.fetchOlderMessagesUntilPreviousUserMock).toHaveBeenCalledWith(apiStub, 'session-1')
        expect(result.current.messages.map((message) => message.id)).toEqual(['message-0', 'message-1'])
        expect(result.current.messagesVersion).toBe(2)
        expect(result.current.hasMore).toBe(false)
    })
})
