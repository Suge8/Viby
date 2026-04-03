import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LoadMoreMessagesResult } from '@/lib/message-window-store'
import { getCurrentTopThreadAnchorId } from '@/components/AssistantChat/threadViewportAnchors'
import {
    createConversationLookup,
    resolvePreviousUserTargetId,
    resolveVisibleJumpTargetId,
} from '@/components/AssistantChat/threadViewportHistoryTargets'
import {
    type PendingScrollSnapshot,
    useThreadViewportAlignment,
} from '@/components/AssistantChat/useThreadViewportAlignment'

type UseThreadViewportOptions = {
    sessionId: string
    hasMoreMessages: boolean
    isLoadingMessages: boolean
    isLoadingMoreMessages: boolean
    pinToBottomOnSessionEntry?: boolean
    onLoadHistoryUntilPreviousUser: () => Promise<LoadMoreMessagesResult>
    onLoadMore: () => Promise<LoadMoreMessagesResult>
    onAtBottomChange: (atBottom: boolean) => void
    onFlushPending: () => void
    messagesVersion: number
    streamVersion: number
    orderedMessageIds: readonly string[]
    conversationMessageIds: readonly string[]
    threadMessageOwnerById: ReadonlyMap<string, string>
    historyJumpTargetMessageIds: readonly string[]
    forceScrollToken: number
}

export type HistoryControlMode = 'jump-previous-user' | 'load-more'

type UseThreadViewportResult = {
    viewportRef: React.RefObject<HTMLDivElement | null>
    historyControlMode: HistoryControlMode
    isHistoryControlVisible: boolean
    shouldReserveHistoryControlInset: boolean
    isHistoryActionPending: boolean
    isAtBottom: boolean
    scrollToBottom: () => void
    handleHistoryControlClick: () => void
}

const BOTTOM_STATUS_THRESHOLD_PX = 120
const BOTTOM_FOLLOW_EPSILON_PX = 8
const BOTTOM_ALIGNMENT_EPSILON_PX = 8
const HISTORY_LOAD_MORE_THRESHOLD_PX = 96
const VIEWPORT_TOP_EDGE_EPSILON_PX = 8
const MESSAGE_ALIGNMENT_EPSILON_PX = 1
const MESSAGE_ALIGNMENT_TRACKING_MS = 500

type PendingLoadMoreAction = {
    token: number
    mode: 'load-more'
    baseMessagesVersion: number
    anchor: PendingScrollSnapshot
}

type PendingPreviousUserJumpAction = {
    token: number
    mode: 'jump-previous-user'
    baseMessagesVersion: number
    referenceMessageId: string
}

type PendingHistoryAction = PendingLoadMoreAction | PendingPreviousUserJumpAction

type ScrollIntent = 'none' | 'user'

function updateBooleanState(
    ref: React.MutableRefObject<boolean>,
    setState: React.Dispatch<React.SetStateAction<boolean>>,
    nextValue: boolean
): void {
    if (nextValue === ref.current) {
        return
    }

    ref.current = nextValue
    setState(nextValue)
}

function getViewportDistanceFromBottom(viewport: HTMLDivElement): number {
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
}

function isViewportNearBottom(viewport: HTMLDivElement): boolean {
    return getViewportDistanceFromBottom(viewport) < BOTTOM_STATUS_THRESHOLD_PX
}

function isViewportPinnedToBottom(viewport: HTMLDivElement): boolean {
    return getViewportDistanceFromBottom(viewport) <= BOTTOM_FOLLOW_EPSILON_PX
}

function isViewportNearHistoryBoundary(viewport: HTMLDivElement): boolean {
    return viewport.scrollTop <= HISTORY_LOAD_MORE_THRESHOLD_PX
}

function getViewportBottomScrollTop(viewport: HTMLDivElement): number {
    return Math.max(0, viewport.scrollHeight - viewport.clientHeight)
}

function getViewportTopEdgePx(viewport: HTMLDivElement): number {
    return viewport.getBoundingClientRect().top + VIEWPORT_TOP_EDGE_EPSILON_PX
}

function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function didLoadOlderMessages(result: LoadMoreMessagesResult): boolean {
    return result.didLoadOlderMessages
}

function resolveViewportHistoryTargets(options: {
    conversationLookup: ReturnType<typeof createConversationLookup>
    orderedMessageIds: readonly string[]
    threadMessageOwnerById: ReadonlyMap<string, string>
    viewport: HTMLDivElement
}): {
    referenceMessageId: string | null
    visibleJumpTargetId: string | null
} {
    const viewportTopEdgePx = getViewportTopEdgePx(options.viewport)
    const referenceMessageId = getCurrentTopThreadAnchorId({
        viewport: options.viewport,
        orderedMessageIds: options.orderedMessageIds,
        viewportTopEdgePx
    })

    return {
        referenceMessageId,
        visibleJumpTargetId: resolveVisibleJumpTargetId({
            threadMessageOwnerById: options.threadMessageOwnerById,
            referenceMessageId,
            conversationLookup: options.conversationLookup
        })
    }
}

export function useThreadViewport(options: UseThreadViewportOptions): UseThreadViewportResult {
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const pendingHistoryActionRef = useRef<PendingHistoryAction | null>(null)
    const historyActionLockTokenRef = useRef<number | null>(null)
    const historyActionSettleTimeoutRef = useRef<number | null>(null)
    const scrollIntentRef = useRef<ScrollIntent>('none')
    const atBottomRef = useRef(true)
    const pinnedToBottomRef = useRef(true)
    const isNearHistoryBoundaryRef = useRef(false)
    const hasPreviousUserTargetRef = useRef(false)
    const historyActionTokenRef = useRef(0)
    const forceScrollTokenRef = useRef(options.forceScrollToken)
    const shouldPinToBottomOnSessionEntryRef = useRef(options.pinToBottomOnSessionEntry === true)
    const isLoadingMessagesRef = useRef(options.isLoadingMessages)
    const isLoadingMoreRef = useRef(options.isLoadingMoreMessages)
    const hasMoreMessagesRef = useRef(options.hasMoreMessages)
    const messagesVersionRef = useRef(options.messagesVersion)
    const onLoadHistoryUntilPreviousUserRef = useRef(options.onLoadHistoryUntilPreviousUser)
    const onLoadMoreRef = useRef(options.onLoadMore)
    const onAtBottomChangeRef = useRef(options.onAtBottomChange)
    const onFlushPendingRef = useRef(options.onFlushPending)
    const [isNearHistoryBoundary, setIsNearHistoryBoundary] = useState(false)
    const [hasPreviousUserTarget, setHasPreviousUserTarget] = useState(false)
    const [isHistoryActionPending, setIsHistoryActionPending] = useState(false)
    const [isAtBottom, setIsAtBottom] = useState(true)

    shouldPinToBottomOnSessionEntryRef.current = options.pinToBottomOnSessionEntry === true
    isLoadingMessagesRef.current = options.isLoadingMessages
    isLoadingMoreRef.current = options.isLoadingMoreMessages
    hasMoreMessagesRef.current = options.hasMoreMessages
    messagesVersionRef.current = options.messagesVersion
    onLoadHistoryUntilPreviousUserRef.current = options.onLoadHistoryUntilPreviousUser
    onLoadMoreRef.current = options.onLoadMore
    onAtBottomChangeRef.current = options.onAtBottomChange
    onFlushPendingRef.current = options.onFlushPending

    const conversationLookup = useMemo(() => {
        return createConversationLookup(
            options.conversationMessageIds,
            options.historyJumpTargetMessageIds
        )
    }, [options.conversationMessageIds, options.historyJumpTargetMessageIds])
    const {
        cancelPendingMessageAlignment,
        isBottomAlignmentPending,
        capturePendingScrollSnapshot,
        restorePendingScrollSnapshot,
        trackThreadMessageAlignment,
        stickToViewportBottom
    } = useThreadViewportAlignment({
        orderedMessageIds: options.orderedMessageIds,
        viewportTopEdgeEpsilonPx: VIEWPORT_TOP_EDGE_EPSILON_PX,
        messageAlignmentEpsilonPx: MESSAGE_ALIGNMENT_EPSILON_PX,
        viewportBottomEdgeEpsilonPx: BOTTOM_ALIGNMENT_EPSILON_PX,
        trackingMs: MESSAGE_ALIGNMENT_TRACKING_MS
    })

    const markViewportAsPinnedToBottom = useCallback((flushPending: boolean): void => {
        updateBooleanState(atBottomRef, setIsAtBottom, true)
        pinnedToBottomRef.current = true
        onAtBottomChangeRef.current(true)
        if (flushPending) {
            onFlushPendingRef.current()
        }
    }, [])

    const clearHistoryControlState = useCallback((): void => {
        isNearHistoryBoundaryRef.current = false
        hasPreviousUserTargetRef.current = false
        setIsNearHistoryBoundary(false)
        setHasPreviousUserTarget(false)
    }, [])

    const syncViewportBottomState = useCallback((viewport: HTMLDivElement): void => {
        pinnedToBottomRef.current = isViewportPinnedToBottom(viewport)
        const nextAtBottom = isViewportNearBottom(viewport)
        if (nextAtBottom === atBottomRef.current) {
            return
        }

        updateBooleanState(atBottomRef, setIsAtBottom, nextAtBottom)
        onAtBottomChangeRef.current(nextAtBottom)
        if (nextAtBottom) {
            onFlushPendingRef.current()
        }
    }, [])

    const syncHistoryControlState = useCallback((viewport: HTMLDivElement): void => {
        const { visibleJumpTargetId } = resolveViewportHistoryTargets({
            viewport,
            orderedMessageIds: options.orderedMessageIds,
            threadMessageOwnerById: options.threadMessageOwnerById,
            conversationLookup
        })

        updateBooleanState(
            isNearHistoryBoundaryRef,
            setIsNearHistoryBoundary,
            isViewportNearHistoryBoundary(viewport)
        )
        updateBooleanState(
            hasPreviousUserTargetRef,
            setHasPreviousUserTarget,
            visibleJumpTargetId !== null
        )
    }, [conversationLookup, options.orderedMessageIds, options.threadMessageOwnerById])

    const syncViewportState = useCallback((viewport: HTMLDivElement): void => {
        syncViewportBottomState(viewport)
        syncHistoryControlState(viewport)
    }, [syncHistoryControlState, syncViewportBottomState])

    const clearHistoryActionSettleTimeout = useCallback((): void => {
        if (historyActionSettleTimeoutRef.current === null) {
            return
        }

        window.clearTimeout(historyActionSettleTimeoutRef.current)
        historyActionSettleTimeoutRef.current = null
    }, [])

    const resetPendingHistoryAction = useCallback((): void => {
        clearHistoryActionSettleTimeout()
        pendingHistoryActionRef.current = null
        historyActionLockTokenRef.current = null
        setIsHistoryActionPending(false)
    }, [clearHistoryActionSettleTimeout])

    const keepHistoryActionPendingUntilSettled = useCallback((token: number): void => {
        historyActionLockTokenRef.current = token
        setIsHistoryActionPending(true)
        clearHistoryActionSettleTimeout()
        historyActionSettleTimeoutRef.current = window.setTimeout(() => {
            if (historyActionLockTokenRef.current !== token) {
                return
            }

            historyActionSettleTimeoutRef.current = null
            historyActionLockTokenRef.current = null
            setIsHistoryActionPending(false)

            const currentViewport = viewportRef.current
            if (currentViewport) {
                syncViewportState(currentViewport)
            }
        }, MESSAGE_ALIGNMENT_TRACKING_MS)
    }, [clearHistoryActionSettleTimeout, syncViewportState])

    const startPreviousUserAlignment = useCallback((
        viewport: HTMLDivElement,
        token: number,
        targetId: string
    ): boolean => {
        if (!trackThreadMessageAlignment(viewport, targetId)) {
            return false
        }

        keepHistoryActionPendingUntilSettled(token)
        syncViewportState(viewport)
        return true
    }, [keepHistoryActionPendingUntilSettled, syncViewportState, trackThreadMessageAlignment])

    const requestOlderMessagesPage = useCallback((viewport: HTMLDivElement, token: number): boolean => {
        if (
            isLoadingMessagesRef.current
            || isLoadingMoreRef.current
            || !hasMoreMessagesRef.current
            || historyActionLockTokenRef.current !== null
        ) {
            return false
        }

        pendingHistoryActionRef.current = {
            token,
            mode: 'load-more',
            baseMessagesVersion: messagesVersionRef.current,
            anchor: capturePendingScrollSnapshot(viewport, getViewportTopEdgePx(viewport))
        }
        historyActionLockTokenRef.current = token
        setIsHistoryActionPending(true)

        void onLoadMoreRef.current()
            .then((result) => {
                const pendingHistoryAction = pendingHistoryActionRef.current
                if (!pendingHistoryAction || pendingHistoryAction.token !== token) {
                    return
                }

                if (didLoadOlderMessages(result)) {
                    return
                }

                resetPendingHistoryAction()
                const currentViewport = viewportRef.current
                if (currentViewport) {
                    syncViewportState(currentViewport)
                }
            })
            .catch((error) => {
                if (pendingHistoryActionRef.current?.token === token) {
                    resetPendingHistoryAction()
                }
                console.error('Failed to load older messages:', error)
            })

        return true
    }, [capturePendingScrollSnapshot, resetPendingHistoryAction, syncViewportState])

    const requestPreviousUserJump = useCallback((token: number, referenceMessageId: string): boolean => {
        if (
            isLoadingMessagesRef.current
            || isLoadingMoreRef.current
            || !hasMoreMessagesRef.current
            || historyActionLockTokenRef.current !== null
        ) {
            return false
        }

        pendingHistoryActionRef.current = {
            token,
            mode: 'jump-previous-user',
            referenceMessageId,
            baseMessagesVersion: messagesVersionRef.current
        }
        historyActionLockTokenRef.current = token
        setIsHistoryActionPending(true)

        void onLoadHistoryUntilPreviousUserRef.current()
            .then((result) => {
                const pendingHistoryAction = pendingHistoryActionRef.current
                if (!pendingHistoryAction || pendingHistoryAction.token !== token) {
                    return
                }

                if (didLoadOlderMessages(result)) {
                    return
                }

                resetPendingHistoryAction()
                const currentViewport = viewportRef.current
                if (currentViewport) {
                    syncViewportState(currentViewport)
                }
            })
            .catch((error) => {
                if (pendingHistoryActionRef.current?.token === token) {
                    resetPendingHistoryAction()
                }
                console.error('Failed to load previous user history:', error)
            })

        return true
    }, [resetPendingHistoryAction, syncViewportState])

    const finishPendingHistoryAction = useCallback((
        viewport: HTMLDivElement,
        pendingHistoryAction: PendingLoadMoreAction
    ): void => {
        pendingHistoryActionRef.current = null
        restorePendingScrollSnapshot(viewport, pendingHistoryAction.anchor)
        keepHistoryActionPendingUntilSettled(pendingHistoryAction.token)
        syncViewportState(viewport)
    }, [
        keepHistoryActionPendingUntilSettled,
        restorePendingScrollSnapshot,
        syncViewportState
    ])

    const continuePendingPreviousUserJump = useCallback((
        viewport: HTMLDivElement,
        pendingHistoryAction: PendingPreviousUserJumpAction
    ): void => {
        const targetId = resolvePreviousUserTargetId({
            conversationLookup,
            threadMessageOwnerById: options.threadMessageOwnerById,
            referenceMessageId: pendingHistoryAction.referenceMessageId
        })
        if (targetId && startPreviousUserAlignment(viewport, pendingHistoryAction.token, targetId)) {
            pendingHistoryActionRef.current = null
            syncViewportState(viewport)
            return
        }

        resetPendingHistoryAction()
        syncViewportState(viewport)
    }, [
        conversationLookup,
        options.threadMessageOwnerById,
        resetPendingHistoryAction,
        syncViewportState,
        startPreviousUserAlignment
    ])

    const scrollToBottom = useCallback(() => {
        const viewport = viewportRef.current
        if (viewport) {
            viewport.scrollTo({
                top: getViewportBottomScrollTop(viewport),
                behavior: prefersReducedMotion() ? 'auto' : 'smooth'
            })
        }

        cancelPendingMessageAlignment()
        resetPendingHistoryAction()
        markViewportAsPinnedToBottom(true)
    }, [cancelPendingMessageAlignment, markViewportAsPinnedToBottom, resetPendingHistoryAction])

    const handleHistoryControlClick = useCallback(() => {
        const viewport = viewportRef.current
        if (!viewport) {
            return
        }

        if (
            isHistoryActionPending
            || isLoadingMessagesRef.current
            || isLoadingMoreRef.current
            || historyActionLockTokenRef.current !== null
        ) {
            return
        }

        const isNearHistoryBoundary = isViewportNearHistoryBoundary(viewport)
        const { referenceMessageId, visibleJumpTargetId } = resolveViewportHistoryTargets({
            viewport,
            orderedMessageIds: options.orderedMessageIds,
            threadMessageOwnerById: options.threadMessageOwnerById,
            conversationLookup
        })

        if (isNearHistoryBoundary) {
            if (!hasMoreMessagesRef.current) {
                return
            }

            historyActionTokenRef.current += 1
            requestOlderMessagesPage(viewport, historyActionTokenRef.current)
            return
        }

        if (visibleJumpTargetId) {
            historyActionTokenRef.current += 1
            if (startPreviousUserAlignment(viewport, historyActionTokenRef.current, visibleJumpTargetId)) {
                return
            }
        }

        if (!hasMoreMessagesRef.current) {
            return
        }

        if (!referenceMessageId) {
            return
        }

        historyActionTokenRef.current += 1
        requestPreviousUserJump(historyActionTokenRef.current, referenceMessageId)
    }, [
        conversationLookup,
        isHistoryActionPending,
        options.orderedMessageIds,
        options.threadMessageOwnerById,
        requestOlderMessagesPage,
        requestPreviousUserJump,
        startPreviousUserAlignment
    ])

    useEffect(() => {
        const viewportElement = viewportRef.current
        if (!viewportElement) {
            return
        }
        const viewport = viewportElement

        function markUserScrollIntent(): void {
            scrollIntentRef.current = 'user'
        }

        function handleScroll(): void {
            const wasUserScrollIntent = scrollIntentRef.current === 'user'
            scrollIntentRef.current = 'none'
            syncViewportState(viewport)

            if (wasUserScrollIntent && historyActionLockTokenRef.current !== null) {
                cancelPendingMessageAlignment()
                resetPendingHistoryAction()
                syncViewportState(viewport)
                return
            }

            if (wasUserScrollIntent && isBottomAlignmentPending() && !isViewportPinnedToBottom(viewport)) {
                cancelPendingMessageAlignment()
            }
        }

        syncViewportState(viewport)
        viewport.addEventListener('pointerdown', markUserScrollIntent, { passive: true })
        viewport.addEventListener('wheel', markUserScrollIntent, { passive: true })
        viewport.addEventListener('touchstart', markUserScrollIntent, { passive: true })
        viewport.addEventListener('touchmove', markUserScrollIntent, { passive: true })
        viewport.addEventListener('scroll', handleScroll, { passive: true })

        return () => {
            viewport.removeEventListener('pointerdown', markUserScrollIntent)
            viewport.removeEventListener('wheel', markUserScrollIntent)
            viewport.removeEventListener('touchstart', markUserScrollIntent)
            viewport.removeEventListener('touchmove', markUserScrollIntent)
            viewport.removeEventListener('scroll', handleScroll)
        }
    }, [
        cancelPendingMessageAlignment,
        isBottomAlignmentPending,
        options.sessionId,
        resetPendingHistoryAction,
        syncViewportState
    ])

    useLayoutEffect(() => {
        cancelPendingMessageAlignment()
        resetPendingHistoryAction()
        scrollIntentRef.current = 'none'
        markViewportAsPinnedToBottom(false)
        clearHistoryControlState()
        forceScrollTokenRef.current = options.forceScrollToken
        shouldPinToBottomOnSessionEntryRef.current = options.pinToBottomOnSessionEntry === true
    }, [
        cancelPendingMessageAlignment,
        clearHistoryControlState,
        markViewportAsPinnedToBottom,
        options.pinToBottomOnSessionEntry,
        options.sessionId,
        resetPendingHistoryAction
    ])

    useEffect(() => {
        if (forceScrollTokenRef.current === options.forceScrollToken) {
            return
        }

        forceScrollTokenRef.current = options.forceScrollToken
        const viewport = viewportRef.current
        cancelPendingMessageAlignment()
        resetPendingHistoryAction()
        if (!viewport) {
            markViewportAsPinnedToBottom(true)
            return
        }

        stickToViewportBottom(viewport)
        syncViewportState(viewport)
    }, [
        cancelPendingMessageAlignment,
        markViewportAsPinnedToBottom,
        options.forceScrollToken,
        resetPendingHistoryAction,
        stickToViewportBottom,
        syncViewportState
    ])

    useLayoutEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) {
            return
        }

        const pendingHistoryAction = pendingHistoryActionRef.current
        if (!pendingHistoryAction) {
            if (shouldPinToBottomOnSessionEntryRef.current && options.orderedMessageIds.length > 0) {
                shouldPinToBottomOnSessionEntryRef.current = false
                stickToViewportBottom(viewport)
                syncViewportState(viewport)
                return
            }
            if (pinnedToBottomRef.current) {
                stickToViewportBottom(viewport)
            }
            syncViewportState(viewport)
            return
        }

        if (options.messagesVersion <= pendingHistoryAction.baseMessagesVersion) {
            syncViewportState(viewport)
            return
        }

        if (pendingHistoryAction.mode === 'jump-previous-user') {
            continuePendingPreviousUserJump(viewport, pendingHistoryAction)
            return
        }

        finishPendingHistoryAction(viewport, pendingHistoryAction)
    }, [
        options.messagesVersion,
        options.orderedMessageIds.length,
        continuePendingPreviousUserJump,
        finishPendingHistoryAction,
        stickToViewportBottom,
        syncViewportState
    ])

    useEffect(() => {
        return () => {
            clearHistoryActionSettleTimeout()
        }
    }, [clearHistoryActionSettleTimeout])

    useLayoutEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) {
            return
        }

        if (pendingHistoryActionRef.current) {
            syncViewportBottomState(viewport)
            return
        }

        if (pinnedToBottomRef.current) {
            stickToViewportBottom(viewport)
        }

        syncViewportBottomState(viewport)
    }, [options.streamVersion, stickToViewportBottom, syncViewportBottomState])

    const historyControlMode: HistoryControlMode = isNearHistoryBoundary ? 'load-more' : 'jump-previous-user'
    const isHistoryControlVisible = shouldShowHistoryControl({
        hasMoreMessages: options.hasMoreMessages,
        hasPreviousUserTarget,
        isHistoryActionPending,
        mode: historyControlMode
    })
    const shouldReserveHistoryControlInset = isNearHistoryBoundary || isHistoryControlVisible

    return {
        viewportRef,
        historyControlMode,
        isHistoryControlVisible,
        shouldReserveHistoryControlInset,
        isHistoryActionPending,
        isAtBottom,
        scrollToBottom,
        handleHistoryControlClick
    }
}

function shouldShowHistoryControl(options: {
    hasMoreMessages: boolean
    hasPreviousUserTarget: boolean
    isHistoryActionPending: boolean
    mode: HistoryControlMode
}): boolean {
    if (options.isHistoryActionPending) {
        return true
    }

    if (options.mode === 'load-more') {
        return options.hasMoreMessages
    }

    return options.hasPreviousUserTarget || options.hasMoreMessages
}
