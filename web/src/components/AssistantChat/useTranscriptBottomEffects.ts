import { type MutableRefObject, type RefObject, useEffect } from 'react'
import type { TranscriptFollowMode } from './transcriptScrollPolicy'
import { resolveViewportAtBottom, TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX } from './transcriptScrollPolicy'

export function useTranscriptBottomEffects(options: {
    alignToBottom: boolean
    composerAnchorTop: number
    explicitBottomPendingRef: MutableRefObject<boolean>
    followModeRef: MutableRefObject<TranscriptFollowMode>
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

        if (options.previousRowCountRef.current === 0) {
            options.startExplicitBottomTransaction('auto')
        }
        options.previousRowCountRef.current = options.rowCount
        if (options.explicitBottomPendingRef.current) {
            options.runExplicitBottomTransaction()
        }
    }, [
        options.alignToBottom,
        options.explicitBottomPendingRef,
        options.previousRowCountRef,
        options.resetExplicitBottomState,
        options.rowCount,
        options.runExplicitBottomTransaction,
        options.startExplicitBottomTransaction,
    ])

    useEffect(() => {
        if (options.rowCount === 0 || !options.alignToBottom) {
            return
        }

        if (options.explicitBottomPendingRef.current) {
            options.runExplicitBottomTransaction()
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
        options.measuredAtBottomRef,
        options.rowCount,
        options.runExplicitBottomTransaction,
        options.startExplicitBottomTransaction,
        options.viewportRef,
    ])
}
