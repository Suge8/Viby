import { type RefObject, useCallback, useRef, useState } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { readTranscriptTopAnchorSpacePx } from './transcriptAnchorGeometry'
import { resolveTranscriptHistoryJumpTargetRowByConversationId } from './transcriptVisibleRows'

const TOP_ANCHOR_TOLERANCE_PX = 2
const TOP_ANCHOR_SETTLE_FRAME_LIMIT = 120
const TOP_ANCHOR_STABLE_FRAME_LIMIT = 2

export function useTranscriptTopAnchor(options: {
    rowStartIndexByConversationId: ReadonlyMap<string, number>
    viewportRef: RefObject<HTMLDivElement | null>
    virtuosoRef: RefObject<VirtuosoHandle | null>
}) {
    const { rowStartIndexByConversationId, viewportRef, virtuosoRef } = options
    const topAnchorFrameRef = useRef<number | null>(null)
    const topAnchorProgrammaticScrollGuardFrameRef = useRef<number | null>(null)
    const topAnchorProgrammaticScrollRef = useRef(false)
    const pendingConversationIdRef = useRef<string | null>(null)
    const settleFrameCountRef = useRef(0)
    const stableFrameCountRef = useRef(0)
    const [topAnchorPending, setTopAnchorPending] = useState(false)

    const clearTopAnchorFrame = useCallback(() => {
        if (topAnchorFrameRef.current !== null) {
            cancelAnimationFrame(topAnchorFrameRef.current)
            topAnchorFrameRef.current = null
        }
    }, [])

    const clearTopAnchorProgrammaticScrollGuard = useCallback(() => {
        if (topAnchorProgrammaticScrollGuardFrameRef.current !== null) {
            cancelAnimationFrame(topAnchorProgrammaticScrollGuardFrameRef.current)
            topAnchorProgrammaticScrollGuardFrameRef.current = null
        }
        topAnchorProgrammaticScrollRef.current = false
    }, [])

    const resetTopAnchorState = useCallback(() => {
        pendingConversationIdRef.current = null
        settleFrameCountRef.current = 0
        stableFrameCountRef.current = 0
        setTopAnchorPending(false)
    }, [])

    const cancelTopAnchorTransaction = useCallback(() => {
        clearTopAnchorFrame()
        clearTopAnchorProgrammaticScrollGuard()
        resetTopAnchorState()
    }, [clearTopAnchorFrame, clearTopAnchorProgrammaticScrollGuard, resetTopAnchorState])

    const armTopAnchorProgrammaticScrollGuard = useCallback(() => {
        clearTopAnchorProgrammaticScrollGuard()
        topAnchorProgrammaticScrollRef.current = true
    }, [clearTopAnchorProgrammaticScrollGuard])

    const runTopAnchorTransaction = useCallback(() => {
        if (pendingConversationIdRef.current === null || topAnchorFrameRef.current !== null) {
            return
        }

        const tick = () => {
            topAnchorFrameRef.current = null
            const conversationId = pendingConversationIdRef.current
            if (conversationId === null) {
                return
            }

            const row = resolveTranscriptHistoryJumpTargetRowByConversationId({
                conversationId,
                viewport: viewportRef.current,
            })
            const viewport = viewportRef.current
            const handle = virtuosoRef.current
            if (row && viewport) {
                const viewportTop = viewport.getBoundingClientRect().top
                const targetTop = readTranscriptTopAnchorSpacePx(viewport)
                const delta = Math.round(row.getBoundingClientRect().top - viewportTop - targetTop)

                if (Math.abs(delta) <= TOP_ANCHOR_TOLERANCE_PX) {
                    stableFrameCountRef.current += 1
                    if (stableFrameCountRef.current >= TOP_ANCHOR_STABLE_FRAME_LIMIT) {
                        resetTopAnchorState()
                        return
                    }

                    settleFrameCountRef.current += 1
                    if (settleFrameCountRef.current >= TOP_ANCHOR_SETTLE_FRAME_LIMIT) {
                        resetTopAnchorState()
                        return
                    }

                    topAnchorFrameRef.current = requestAnimationFrame(tick)
                    return
                }

                stableFrameCountRef.current = 0
                armTopAnchorProgrammaticScrollGuard()
                if (handle?.scrollTo) {
                    handle.scrollTo({
                        top: Math.max(0, viewport.scrollTop + delta),
                        behavior: 'auto',
                    })
                } else if (handle?.scrollBy) {
                    handle.scrollBy({
                        top: delta,
                        behavior: 'auto',
                    })
                } else {
                    viewport.scrollTop = Math.max(0, viewport.scrollTop + delta)
                }
                settleFrameCountRef.current += 1
                if (settleFrameCountRef.current >= TOP_ANCHOR_SETTLE_FRAME_LIMIT) {
                    resetTopAnchorState()
                    return
                }

                topAnchorFrameRef.current = requestAnimationFrame(tick)
                return
            }

            if (row) {
                stableFrameCountRef.current = 0
                resetTopAnchorState()
                return
            }

            stableFrameCountRef.current = 0
            settleFrameCountRef.current += 1
            if (settleFrameCountRef.current >= TOP_ANCHOR_SETTLE_FRAME_LIMIT) {
                resetTopAnchorState()
                return
            }

            topAnchorFrameRef.current = requestAnimationFrame(tick)
        }

        topAnchorFrameRef.current = requestAnimationFrame(tick)
    }, [armTopAnchorProgrammaticScrollGuard, resetTopAnchorState, viewportRef])

    const revealConversationAtTopAnchor = useCallback(
        (conversationId: string) => {
            const targetIndex = rowStartIndexByConversationId.get(conversationId)
            if (targetIndex === undefined) {
                return false
            }

            pendingConversationIdRef.current = conversationId
            settleFrameCountRef.current = 0
            stableFrameCountRef.current = 0
            setTopAnchorPending(true)
            clearTopAnchorFrame()
            armTopAnchorProgrammaticScrollGuard()
            virtuosoRef.current?.scrollToIndex({
                index: targetIndex,
                align: 'start',
                behavior: 'auto',
            })
            runTopAnchorTransaction()
            return true
        },
        [
            armTopAnchorProgrammaticScrollGuard,
            clearTopAnchorFrame,
            rowStartIndexByConversationId,
            runTopAnchorTransaction,
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
        clearTopAnchorFrame,
        handleViewportScrollCapture,
        topAnchorPending,
        isTopAnchorTransactionPending,
        revealConversationAtTopAnchor,
    }
}
