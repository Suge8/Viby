import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ListRange, VirtuosoHandle } from 'react-virtuoso'
import {
    buildTranscriptFollowOutput,
    buildTranscriptHeightEstimates,
    detectPrependedTranscriptRows,
    INITIAL_TRANSCRIPT_FIRST_ITEM_INDEX,
    resolveTranscriptDefaultItemHeight,
    resolveTranscriptLastItemIndex,
    resolveTranscriptTopConversationId,
    type TranscriptFollowMode,
} from './transcriptScrollPolicy'
import {
    useTranscriptVirtuosoControllerSurface,
    useTranscriptVirtuosoForegroundSync,
} from './transcriptVirtuosoEffects'
import { type UseTranscriptVirtuosoOptions, type UseTranscriptVirtuosoResult } from './transcriptVirtuosoTypes'
import { useTranscriptActiveTurnAnchor } from './useTranscriptActiveTurnAnchor'
import { useTranscriptAtBottomOwner, useTranscriptAtBottomSignal } from './useTranscriptAtBottomOwner'
import { useTranscriptBottomEffects } from './useTranscriptBottomEffects'
import { useTranscriptExplicitBottom } from './useTranscriptExplicitBottom'
import { useTranscriptHistoryNavigation } from './useTranscriptHistoryNavigation'
import { useTranscriptLeaveBottomIntent } from './useTranscriptLeaveBottomIntent'
import { useTranscriptTopAnchor } from './useTranscriptTopAnchor'
import { useTranscriptViewportControls } from './useTranscriptViewportControls'

export function useTranscriptVirtuoso(options: UseTranscriptVirtuosoOptions): UseTranscriptVirtuosoResult {
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const virtuosoRef = useRef<VirtuosoHandle | null>(null)
    const previousRowsRef = useRef(options.rows)
    const previousRowCountRef = useRef(0)
    const autoScrollFrameRef = useRef<number | null>(null)
    const [firstItemIndex, setFirstItemIndex] = useState(INITIAL_TRANSCRIPT_FIRST_ITEM_INDEX)
    const [followMode, setFollowMode] = useState<TranscriptFollowMode>(options.rows.length > 0 ? 'following' : 'manual')
    const followModeRef = useRef(followMode)
    const [topConversationId, setTopConversationId] = useState<string | null>(
        options.conversationIds[options.conversationIds.length - 1] ?? null
    )
    followModeRef.current = followMode
    const { measuredAtBottomRef, reportAtBottom } = useTranscriptAtBottomSignal({
        onAtBottomChange: options.onAtBottomChange,
        onFlushPending: options.onFlushPending,
    })
    const setFollowModeState = useCallback((nextMode: TranscriptFollowMode) => {
        followModeRef.current = nextMode
        setFollowMode((currentMode) => (currentMode === nextMode ? currentMode : nextMode))
    }, [])
    const clearAutoScrollFrame = useCallback(() => {
        if (autoScrollFrameRef.current !== null) {
            cancelAnimationFrame(autoScrollFrameRef.current)
            autoScrollFrameRef.current = null
        }
    }, [])
    const {
        cancelExplicitBottomTransaction,
        clearExplicitBottomFrame,
        explicitBottomPendingRef,
        pendingAutoFollowRef,
        resetExplicitBottomState,
        runExplicitBottomTransaction,
        setViewportRef: setViewportRefBase,
        setVirtuosoRef,
        startExplicitBottomTransaction,
        shouldIgnoreViewportScrollCapture,
    } = useTranscriptExplicitBottom({
        followModeRef,
        initialPending: false,
        reportAtBottom,
        setFollowMode: setFollowModeState,
        viewportRef,
        virtuosoRef,
    })
    const scrollToBottomAuto = useCallback(() => {
        if (!virtuosoRef.current?.autoscrollToBottom) {
            return false
        }

        virtuosoRef.current.autoscrollToBottom()
        return true
    }, [])
    const cancelPendingAutoFollow = useCallback(() => {
        clearAutoScrollFrame()
        pendingAutoFollowRef.current = false
    }, [clearAutoScrollFrame, pendingAutoFollowRef])

    const enterManualMode = useCallback(
        (markNotAtBottom: boolean) => {
            cancelPendingAutoFollow()
            cancelExplicitBottomTransaction()
            setFollowModeState('manual')
            if (markNotAtBottom) {
                reportAtBottom(false)
            }
        },
        [cancelExplicitBottomTransaction, cancelPendingAutoFollow, reportAtBottom, setFollowModeState]
    )
    const {
        clearLeaveBottomIntentFrame,
        handleViewportTouchMoveCapture: handleViewportTouchMoveCaptureBase,
        handleViewportTouchStartCapture: handleViewportTouchStartCaptureBase,
        handleViewportWheelCapture: handleViewportWheelCaptureBase,
    } = useTranscriptLeaveBottomIntent({
        enterManualMode,
        followModeRef,
    })
    const {
        cancelTopAnchorTransaction,
        handleViewportScrollCapture: handleTopAnchorViewportScrollCapture,
        isTopAnchorTransactionPending,
        topAnchorPending,
        revealConversationAtTopAnchor,
    } = useTranscriptTopAnchor({
        rowStartIndexByConversationId: options.rowStartIndexByConversationId,
        viewportRef,
        virtuosoRef,
    })

    const revealConversationAtManualTop = useCallback(
        (conversationId: string) => {
            if (!options.rowStartIndexByConversationId.has(conversationId)) {
                return false
            }
            cancelTopAnchorTransaction()
            enterManualMode(true)
            return revealConversationAtTopAnchor(conversationId)
        },
        [
            cancelTopAnchorTransaction,
            enterManualMode,
            options.rowStartIndexByConversationId,
            revealConversationAtTopAnchor,
        ]
    )
    const activeTurnAnchor = useTranscriptActiveTurnAnchor({
        activeTurnLocalId: options.activeTurnLocalId,
        rows: options.rows,
        revealConversationAtTopAnchor: revealConversationAtManualTop,
    })
    const scrollToConversation = useCallback(
        (conversationId: string) => {
            activeTurnAnchor.clearActiveTurnAnchor()
            return revealConversationAtManualTop(conversationId)
        },
        [activeTurnAnchor.clearActiveTurnAnchor, revealConversationAtManualTop]
    )

    const {
        clearManualScrollRestoreFrame,
        handleViewportScrollCapture,
        handleViewportTouchMoveCapture,
        handleViewportTouchStartCapture,
        handleViewportWheelCapture,
        setViewportRef,
    } = useTranscriptViewportControls({
        cancelPendingAutoFollow,
        cancelTopAnchorTransaction,
        enterManualMode,
        explicitBottomPendingRef,
        followModeRef,
        handleTopAnchorViewportScrollCapture,
        handleViewportTouchMoveCaptureBase,
        handleViewportTouchStartCaptureBase,
        handleViewportWheelCaptureBase,
        pendingAutoFollowRef,
        setViewportRefBase,
        shouldIgnoreViewportScrollCapture,
        viewportRef,
        virtuosoRef,
    })

    const scheduleAutoScrollToBottom = useCallback(() => {
        if (followModeRef.current !== 'following' || autoScrollFrameRef.current !== null) {
            return
        }

        pendingAutoFollowRef.current = true
        autoScrollFrameRef.current = requestAnimationFrame(() => {
            autoScrollFrameRef.current = null
            scrollToBottomAuto()
        })
    }, [scrollToBottomAuto])
    const { handleAtBottomStateChange, handleTotalListHeightChanged } = useTranscriptAtBottomOwner({
        explicitBottomPendingRef,
        followModeRef,
        isTopAnchorTransactionPending,
        measuredAtBottomRef,
        pendingAutoFollowRef,
        reportAtBottom,
        requestExplicitBottom: () => startExplicitBottomTransaction('auto'),
        resetExplicitBottomState,
        runExplicitBottomTransaction,
        scheduleAutoScrollToBottom,
        setFollowMode: setFollowModeState,
        viewportRef,
    })

    useEffect(() => {
        const prependedCount = detectPrependedTranscriptRows(previousRowsRef.current, options.rows)
        previousRowsRef.current = options.rows
        if (prependedCount === 0) {
            return
        }

        setFirstItemIndex((currentIndex) => currentIndex - prependedCount)
    }, [options.rows])

    useTranscriptBottomEffects({
        alignToBottom: activeTurnAnchor.alignToBottom,
        composerAnchorTop: options.composerAnchorTop,
        explicitBottomPendingRef,
        followModeRef,
        measuredAtBottomRef,
        previousRowCountRef,
        resetExplicitBottomState,
        rowCount: options.rows.length,
        runExplicitBottomTransaction,
        startExplicitBottomTransaction,
        viewportRef,
    })

    useEffect(() => {
        return () => {
            clearAutoScrollFrame()
            clearExplicitBottomFrame()
            clearLeaveBottomIntentFrame()
            clearManualScrollRestoreFrame()
            cancelTopAnchorTransaction()
        }
    }, [
        cancelTopAnchorTransaction,
        clearAutoScrollFrame,
        clearExplicitBottomFrame,
        clearLeaveBottomIntentFrame,
        clearManualScrollRestoreFrame,
    ])

    useTranscriptVirtuosoControllerSurface(options.sessionId)
    useTranscriptVirtuosoForegroundSync({
        viewportRef,
        followModeRef,
        setFollowMode: setFollowModeState,
        reportAtBottom,
        scheduleAutoScrollToBottom,
    })
    const historyNavigation = useTranscriptHistoryNavigation({
        conversationIds: options.conversationIds,
        fallbackConversationId: topConversationId,
        hasMoreMessages: options.hasMoreMessages,
        historyJumpTargetConversationIds: options.historyJumpTargetConversationIds,
        isScrollNavigationPending: topAnchorPending,
        isScrollNavigationPendingRef: isTopAnchorTransactionPending,
        isLoadingMessages: options.isLoadingMessages,
        isLoadingMoreMessages: options.isLoadingMoreMessages,
        onLoadHistoryUntilPreviousUser: options.onLoadHistoryUntilPreviousUser,
        scrollToConversation,
        viewportRef,
    })

    const handleRangeChanged = useCallback(
        (range: ListRange) => {
            setTopConversationId(
                resolveTranscriptTopConversationId({
                    rows: options.rows,
                    firstItemIndex,
                    range,
                })
            )
        },
        [firstItemIndex, options.rows]
    )

    const followOutput = useMemo(() => buildTranscriptFollowOutput(followMode), [followMode])
    const heightEstimates = useMemo(() => buildTranscriptHeightEstimates(options.rows), [options.rows])
    const defaultItemHeight = useMemo(() => resolveTranscriptDefaultItemHeight(heightEstimates), [heightEstimates])
    const lastItemIndex = resolveTranscriptLastItemIndex(options.rows.length)
    const initialTopMostItemIndex =
        lastItemIndex === null
            ? undefined
            : {
                  index: lastItemIndex,
                  align: 'end' as const,
              }
    const scrollToBottom = useCallback(() => {
        cancelTopAnchorTransaction()
        activeTurnAnchor.overrideActiveTurnWithBottom()
        startExplicitBottomTransaction('smooth')
    }, [activeTurnAnchor.overrideActiveTurnWithBottom, cancelTopAnchorTransaction, startExplicitBottomTransaction])

    return {
        setViewportRef,
        setVirtuosoRef,
        viewportRef,
        virtuosoRef,
        firstItemIndex,
        initialTopMostItemIndex,
        alignToBottom: activeTurnAnchor.alignToBottom,
        defaultItemHeight,
        followOutput,
        heightEstimates,
        isHistoryActionPending: historyNavigation.isHistoryActionPending,
        isHistoryControlVisible: historyNavigation.isHistoryControlVisible,
        handleHistoryControlClick: historyNavigation.handleHistoryControlClick,
        handleRangeChanged,
        handleAtBottomStateChange,
        handleTotalListHeightChanged,
        handleViewportWheelCapture,
        handleViewportScrollCapture,
        handleViewportTouchStartCapture,
        handleViewportTouchMoveCapture,
        scrollToBottom,
    }
}
