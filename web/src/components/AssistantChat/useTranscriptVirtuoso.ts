import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FollowOutput, ListRange, VirtuosoHandle } from 'react-virtuoso'
import {
    buildTranscriptFollowOutput,
    buildTranscriptHeightEstimates,
    evictStaleTranscriptHeightEstimates,
    INITIAL_TRANSCRIPT_FIRST_ITEM_INDEX,
    resolveTranscriptDefaultItemHeight,
    resolveTranscriptLastItemIndex,
    shouldPrefetchOlderTranscriptRows,
    type TranscriptFollowMode,
} from './transcriptScrollPolicy'
import {
    useTranscriptVirtuosoControllerSurface,
    useTranscriptVirtuosoForegroundSync,
} from './transcriptVirtuosoEffects'
import { type UseTranscriptVirtuosoOptions, type UseTranscriptVirtuosoResult } from './transcriptVirtuosoTypes'
import { useTranscriptActiveTurnController } from './useTranscriptActiveTurnController'
import { useTranscriptAtBottomOwner, useTranscriptAtBottomSignal } from './useTranscriptAtBottomOwner'
import { useTranscriptBottomEffects } from './useTranscriptBottomEffects'
import { useTranscriptExplicitBottom } from './useTranscriptExplicitBottom'
import { useTranscriptLeaveBottomIntent } from './useTranscriptLeaveBottomIntent'
import { useTranscriptPrependIndex } from './useTranscriptPrependIndex'
import { useTranscriptStartReachedOwner } from './useTranscriptStartReachedOwner'
import { useTranscriptTopAnchor } from './useTranscriptTopAnchor'
import { useTranscriptViewportControls } from './useTranscriptViewportControls'

export function useTranscriptVirtuoso(options: UseTranscriptVirtuosoOptions): UseTranscriptVirtuosoResult {
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const virtuosoRef = useRef<VirtuosoHandle | null>(null)
    const previousRowsRef = useRef(options.rows)
    const previousRowCountRef = useRef(0)
    const autoScrollFrameRef = useRef<number | null>(null)
    // `firstItemIndex` must change in the same render as prepended `data`.
    const firstItemIndexRef = useRef(INITIAL_TRANSCRIPT_FIRST_ITEM_INDEX)
    // True once virtuoso has reported `atBottom: true` at least once. Until
    // then `initialTopMostItemIndex` owns the entry scroll; our follow-mode
    // auto-scroll AND the reverse infinite-scroll prefetch must both stay
    // silent so two scroll owners never fight over the initial mount position
    // and so the prefetch loop cannot fire from an unsettled near-top range.
    const hasSettledInitialBottomRef = useRef(false)
    const { measuredAtBottomRef, reportAtBottom } = useTranscriptAtBottomSignal({
        onAtBottomChange: options.onAtBottomChange,
        onFlushPending: options.onFlushPending,
    })
    const handleStartReached = useTranscriptStartReachedOwner({
        hasMoreHistory: options.hasMoreHistory,
        hasSettledInitialBottomRef,
        measuredAtBottomRef,
        onLoadOlderHistory: options.onLoadOlderHistory,
    })
    const handleRangeChanged = useCallback(
        (range: ListRange) => {
            if (shouldPrefetchOlderTranscriptRows(range, firstItemIndexRef.current)) {
                handleStartReached()
            }
        },
        [handleStartReached]
    )
    const pendingPrependCleanupRef = useRef(false)
    const heightEstimateCacheRef = useRef<Map<string, number>>(new Map())
    const prependSettlingUntilRef = useRef(0)
    const isPrependScrollSettling = useCallback(
        () => prependSettlingUntilRef.current > 0 && performance.now() < prependSettlingUntilRef.current,
        []
    )
    const [followMode, setFollowMode] = useState<TranscriptFollowMode>('following')
    const followModeRef = useRef(followMode)
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
        (conversationId: string, markNotAtBottom = true) => {
            if (!options.rowStartIndexByConversationId.has(conversationId)) {
                return false
            }
            cancelTopAnchorTransaction()
            enterManualMode(markNotAtBottom)
            return revealConversationAtTopAnchor(conversationId)
        },
        [
            cancelTopAnchorTransaction,
            enterManualMode,
            options.rowStartIndexByConversationId,
            revealConversationAtTopAnchor,
        ]
    )
    const { activeTurnAnchor, scrollToConversation } = useTranscriptActiveTurnController({
        activeTurnLocalId: options.activeTurnLocalId,
        cancelTopAnchorTransaction,
        measuredAtBottomRef,
        revealConversationAtManualTop,
        rows: options.rows,
        setFollowMode: setFollowModeState,
        startExplicitBottomTransaction,
        viewportRef,
    })

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
        hasSettledInitialBottomRef,
        isTopAnchorTransactionPending,
        isPrependScrollSettling,
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

    const firstItemIndex = useTranscriptPrependIndex({
        firstItemIndexRef,
        followModeRef,
        pendingPrependCleanupRef,
        prependSettlingUntilRef,
        previousRowsRef,
        rows: options.rows,
    })

    useEffect(() => {
        if (!pendingPrependCleanupRef.current) {
            return
        }
        pendingPrependCleanupRef.current = false
        cancelPendingAutoFollow()
        cancelExplicitBottomTransaction()
        setFollowModeState('manual')
    }, [cancelExplicitBottomTransaction, cancelPendingAutoFollow, firstItemIndex, setFollowModeState])

    useTranscriptBottomEffects({
        alignToBottom: activeTurnAnchor.alignToBottom,
        composerAnchorTop: options.composerAnchorTop,
        explicitBottomPendingRef,
        followModeRef,
        hasSettledInitialBottomRef,
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

    const followOutput: FollowOutput = useCallback((isAtBottom: boolean) => {
        const resolveFollowOutput = buildTranscriptFollowOutput(followModeRef.current)
        if (typeof resolveFollowOutput !== 'function') {
            return resolveFollowOutput
        }
        return resolveFollowOutput(isAtBottom)
    }, [])
    void followMode
    const heightEstimates = useMemo(() => {
        const cache = heightEstimateCacheRef.current
        const estimates = buildTranscriptHeightEstimates(options.rows, cache)
        evictStaleTranscriptHeightEstimates(options.rows, cache)
        return estimates
    }, [options.rows])
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
        handleAtBottomStateChange,
        handleTotalListHeightChanged,
        handleStartReached,
        handleRangeChanged,
        handleViewportWheelCapture,
        handleViewportScrollCapture,
        handleViewportTouchStartCapture,
        handleViewportTouchMoveCapture,
        scrollToBottom,
        scrollToConversation,
    }
}
