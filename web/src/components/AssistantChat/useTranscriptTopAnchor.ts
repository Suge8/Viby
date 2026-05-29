import { type RefObject, useCallback, useRef, useState } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { readTranscriptTopAnchorSpacePx } from './transcriptAnchorGeometry'
import { resolveTranscriptHistoryJumpTargetRowByConversationId } from './transcriptVisibleRows'

const TOP_ANCHOR_TOLERANCE_PX = 2
const TOP_ANCHOR_MAX_CORRECTION_ATTEMPTS = 6

type ScrollEndTarget = HTMLElement & {
    onscrollend?: ((event: Event) => void) | null
}

export function useTranscriptTopAnchor(options: {
    rowStartIndexByConversationId: ReadonlyMap<string, number>
    viewportRef: RefObject<HTMLDivElement | null>
    virtuosoRef: RefObject<VirtuosoHandle | null>
}) {
    const { rowStartIndexByConversationId, viewportRef, virtuosoRef } = options
    const scrollEndCleanupRef = useRef<(() => void) | null>(null)
    const runTopAnchorSettleCorrectionRef = useRef<() => void>(() => {})
    const topAnchorProgrammaticScrollRef = useRef(false)
    const topAnchorCorrectionAttemptRef = useRef(0)
    const pendingConversationIdRef = useRef<string | null>(null)
    const [topAnchorPending, setTopAnchorPending] = useState(false)

    const clearTopAnchorScrollEndWait = useCallback(() => {
        scrollEndCleanupRef.current?.()
        scrollEndCleanupRef.current = null
    }, [])

    const clearTopAnchorProgrammaticScrollGuard = useCallback(() => {
        topAnchorProgrammaticScrollRef.current = false
    }, [])

    const resetTopAnchorState = useCallback(() => {
        clearTopAnchorScrollEndWait()
        clearTopAnchorProgrammaticScrollGuard()
        topAnchorCorrectionAttemptRef.current = 0
        pendingConversationIdRef.current = null
        setTopAnchorPending(false)
    }, [clearTopAnchorProgrammaticScrollGuard, clearTopAnchorScrollEndWait])

    const cancelTopAnchorTransaction = useCallback(() => {
        resetTopAnchorState()
    }, [resetTopAnchorState])

    const armTopAnchorProgrammaticScrollGuard = useCallback(() => {
        topAnchorProgrammaticScrollRef.current = true
    }, [])

    const armTopAnchorScrollEndWait = useCallback(() => {
        clearTopAnchorScrollEndWait()
        const viewport = viewportRef.current as ScrollEndTarget | null
        if (!viewport || !('onscrollend' in viewport)) {
            resetTopAnchorState()
            return
        }
        const handleScrollEnd = () => runTopAnchorSettleCorrectionRef.current()
        viewport.addEventListener('scrollend', handleScrollEnd, { once: true })
        scrollEndCleanupRef.current = () => {
            viewport.removeEventListener('scrollend', handleScrollEnd)
        }
    }, [clearTopAnchorScrollEndWait, resetTopAnchorState, viewportRef])

    const runTopAnchorSettleCorrection = useCallback(() => {
        clearTopAnchorScrollEndWait()
        const conversationId = pendingConversationIdRef.current
        const viewport = viewportRef.current
        const handle = virtuosoRef.current
        if (conversationId === null || !viewport || !handle?.scrollTo) {
            resetTopAnchorState()
            return
        }

        const row = resolveTranscriptHistoryJumpTargetRowByConversationId({ conversationId, viewport })
        if (!row) {
            resetTopAnchorState()
            return
        }

        const viewportTop = viewport.getBoundingClientRect().top
        const targetTop = readTranscriptTopAnchorSpacePx(viewport)
        const delta = Math.round(row.getBoundingClientRect().top - viewportTop - targetTop)
        if (Math.abs(delta) <= TOP_ANCHOR_TOLERANCE_PX) {
            resetTopAnchorState()
            return
        }

        if (topAnchorCorrectionAttemptRef.current >= TOP_ANCHOR_MAX_CORRECTION_ATTEMPTS) {
            resetTopAnchorState()
            return
        }

        topAnchorCorrectionAttemptRef.current += 1
        armTopAnchorProgrammaticScrollGuard()
        handle.scrollTo({ top: Math.max(0, viewport.scrollTop + delta), behavior: 'auto' })
        armTopAnchorScrollEndWait()
    }, [armTopAnchorProgrammaticScrollGuard, armTopAnchorScrollEndWait, resetTopAnchorState, viewportRef, virtuosoRef])
    runTopAnchorSettleCorrectionRef.current = runTopAnchorSettleCorrection

    const revealConversationAtTopAnchor = useCallback(
        (conversationId: string) => {
            const targetIndex = rowStartIndexByConversationId.get(conversationId)
            if (targetIndex === undefined) {
                return false
            }

            const viewport = viewportRef.current
            const anchorOffsetPx = viewport ? readTranscriptTopAnchorSpacePx(viewport) : 0
            pendingConversationIdRef.current = conversationId
            topAnchorCorrectionAttemptRef.current = 0
            setTopAnchorPending(true)
            armTopAnchorProgrammaticScrollGuard()
            virtuosoRef.current?.scrollToIndex({
                index: targetIndex,
                align: 'start',
                behavior: 'smooth',
                offset: anchorOffsetPx === 0 ? 0 : -anchorOffsetPx,
            })
            armTopAnchorScrollEndWait()
            return true
        },
        [
            armTopAnchorProgrammaticScrollGuard,
            armTopAnchorScrollEndWait,
            rowStartIndexByConversationId,
            viewportRef,
            virtuosoRef,
        ]
    )

    const handleViewportScrollCapture = useCallback(() => {
        if (pendingConversationIdRef.current === null || topAnchorProgrammaticScrollRef.current) {
            return
        }

        cancelTopAnchorTransaction()
    }, [cancelTopAnchorTransaction])

    const isTopAnchorTransactionPending = useCallback((): boolean => {
        return pendingConversationIdRef.current !== null
    }, [])

    return {
        cancelTopAnchorTransaction,
        clearTopAnchorScrollEndWait,
        handleViewportScrollCapture,
        isTopAnchorTransactionPending,
        revealConversationAtTopAnchor,
        topAnchorPending,
    }
}
