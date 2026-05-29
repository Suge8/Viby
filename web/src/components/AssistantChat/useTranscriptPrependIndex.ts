import { type MutableRefObject, useMemo } from 'react'
import type { TranscriptRenderRow } from '@/chat/transcriptTypes'
import {
    detectPrependedTranscriptRows,
    PREPEND_SCROLL_SETTLING_MS,
    type TranscriptFollowMode,
} from './transcriptScrollPolicy'

type UseTranscriptPrependIndexOptions = {
    firstItemIndexRef: MutableRefObject<number>
    followModeRef: MutableRefObject<TranscriptFollowMode>
    pendingPrependCleanupRef: MutableRefObject<boolean>
    prependSettlingUntilRef: MutableRefObject<number>
    previousRowsRef: MutableRefObject<readonly TranscriptRenderRow[]>
    rows: readonly TranscriptRenderRow[]
}

export function useTranscriptPrependIndex(options: UseTranscriptPrependIndexOptions): number {
    const {
        firstItemIndexRef,
        followModeRef,
        pendingPrependCleanupRef,
        prependSettlingUntilRef,
        previousRowsRef,
        rows,
    } = options
    return useMemo(() => {
        const previousRows = previousRowsRef.current
        if (previousRows === rows) {
            return firstItemIndexRef.current
        }
        const prependedCount = detectPrependedTranscriptRows(previousRows, rows)
        previousRowsRef.current = rows
        if (prependedCount <= 0) {
            return firstItemIndexRef.current
        }
        firstItemIndexRef.current -= prependedCount
        followModeRef.current = 'manual'
        pendingPrependCleanupRef.current = true
        prependSettlingUntilRef.current = performance.now() + PREPEND_SCROLL_SETTLING_MS
        return firstItemIndexRef.current
    }, [firstItemIndexRef, followModeRef, pendingPrependCleanupRef, prependSettlingUntilRef, previousRowsRef, rows])
}
