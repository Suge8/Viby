import { type MutableRefObject, type RefObject, useEffect } from 'react'
import type { TranscriptFollowMode } from './transcriptScrollPolicy'
import { resolveViewportAtBottom, TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX } from './transcriptScrollPolicy'

export function useTranscriptBottomEffects(options: {
    alignToBottom: boolean
    composerAnchorTop: number
    explicitBottomPendingRef: MutableRefObject<boolean>
    followModeRef: MutableRefObject<TranscriptFollowMode>
    /**
     * Bottom-effect transactions must stay silent until virtuoso confirms the
     * mount-time `initialTopMostItemIndex` scroll has landed at the bottom.
     * Otherwise our own `startExplicitBottomTransaction` competes with virtuoso
     * and the viewport lands at a random middle position on session entry.
     */
    hasSettledInitialBottomRef: MutableRefObject<boolean>
    measuredAtBottomRef: MutableRefObject<boolean>
    previousRowCountRef: MutableRefObject<number>
    resetExplicitBottomState: () => void
    rowCount: number
    runExplicitBottomTransaction: () => void
    startExplicitBottomTransaction: (behavior: 'auto' | 'smooth') => void
    viewportRef: RefObject<HTMLElement | null>
}): void {
    useEffect(() => {
        if (options.rowCount === 0) {
            options.explicitBottomPendingRef.current = false
            options.resetExplicitBottomState()
            options.previousRowCountRef.current = 0
            return
        }

        if (!options.alignToBottom) {
            options.previousRowCountRef.current = options.rowCount
            return
        }

        // Entry / prepend handlers may have already latched manual mode (e.g. the
        // active-turn anchor or the history prepend handler). Honour that intent.
        if (options.followModeRef.current === 'manual') {
            options.previousRowCountRef.current = options.rowCount
            return
        }

        // Initial mount belongs to virtuoso's `initialTopMostItemIndex`. Skip
        // our own first-load explicit-bottom transaction until virtuoso has
        // reported `atBottom: true` once — otherwise two scroll owners race and
        // the entry viewport can land in any middle/top position.
        if (!options.hasSettledInitialBottomRef.current) {
            options.previousRowCountRef.current = options.rowCount
            return
        }

        options.previousRowCountRef.current = options.rowCount
        if (options.explicitBottomPendingRef.current) {
            options.runExplicitBottomTransaction()
        }
    }, [
        options.alignToBottom,
        options.explicitBottomPendingRef,
        options.hasSettledInitialBottomRef,
        options.previousRowCountRef,
        options.resetExplicitBottomState,
        options.rowCount,
        options.runExplicitBottomTransaction,
    ])

    useEffect(() => {
        if (options.rowCount === 0 || !options.alignToBottom) {
            return
        }

        if (options.explicitBottomPendingRef.current) {
            options.runExplicitBottomTransaction()
            return
        }

        if (options.followModeRef.current === 'manual') {
            return
        }

        // Same single-owner contract as the first effect: composer-anchor or
        // row-count deltas during the initial mount must not steal scroll
        // ownership from virtuoso's `initialTopMostItemIndex` settle pass.
        if (!options.hasSettledInitialBottomRef.current) {
            return
        }

        const shouldRefreshBottomAnchor =
            options.followModeRef.current === 'following' ||
            options.measuredAtBottomRef.current ||
            resolveViewportAtBottom(options.viewportRef.current, TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX)
        if (shouldRefreshBottomAnchor) {
            options.startExplicitBottomTransaction('auto')
        }
    }, [
        options.alignToBottom,
        options.composerAnchorTop,
        options.explicitBottomPendingRef,
        options.followModeRef,
        options.hasSettledInitialBottomRef,
        options.measuredAtBottomRef,
        options.rowCount,
        options.runExplicitBottomTransaction,
        options.startExplicitBottomTransaction,
        options.viewportRef,
    ])
}
