import { type MutableRefObject, type RefObject, useCallback, useRef } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import {
    resolveViewportAtBottom,
    TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX,
    type TranscriptFollowMode,
} from './transcriptScrollPolicy'

export function useTranscriptViewportControls(options: {
    cancelPendingAutoFollow: () => void
    cancelTopAnchorTransaction: () => void
    enterManualMode: (markNotAtBottom: boolean) => void
    explicitBottomPendingRef: MutableRefObject<boolean>
    followModeRef: MutableRefObject<TranscriptFollowMode>
    handleTopAnchorViewportScrollCapture: () => void
    handleViewportTouchMoveCaptureBase: (event: Pick<TouchEvent, 'touches'>) => void
    handleViewportTouchStartCaptureBase: (event: Pick<TouchEvent, 'touches'>) => void
    handleViewportWheelCaptureBase: (event: Pick<WheelEvent, 'deltaY'>) => void
    pendingAutoFollowRef: MutableRefObject<boolean>
    setViewportRefBase: (viewport: HTMLDivElement | null) => void
    shouldIgnoreViewportScrollCapture: (scrollTop: number) => boolean
    viewportRef: RefObject<HTMLDivElement | null>
    virtuosoRef: RefObject<VirtuosoHandle | null>
}) {
    const {
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
    } = options
    const lastViewportScrollTopRef = useRef<number | null>(null)
    const manualScrollRestoreFrameRef = useRef<number | null>(null)

    const clearManualScrollRestoreFrame = useCallback(() => {
        if (manualScrollRestoreFrameRef.current !== null) {
            cancelAnimationFrame(manualScrollRestoreFrameRef.current)
            manualScrollRestoreFrameRef.current = null
        }
    }, [])

    const handleViewportWheelCapture = useCallback(
        (event: Pick<WheelEvent, 'deltaY'>) => {
            cancelTopAnchorTransaction()
            handleViewportWheelCaptureBase(event)
        },
        [cancelTopAnchorTransaction, handleViewportWheelCaptureBase]
    )

    const handleViewportTouchStartCapture = useCallback(
        (event: Pick<TouchEvent, 'touches'>) => {
            cancelTopAnchorTransaction()
            if (
                viewportRef.current &&
                resolveViewportAtBottom(viewportRef.current, TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX) &&
                (explicitBottomPendingRef.current || pendingAutoFollowRef.current)
            ) {
                enterManualMode(false)
            }
            handleViewportTouchStartCaptureBase(event)
        },
        [
            cancelTopAnchorTransaction,
            enterManualMode,
            explicitBottomPendingRef,
            handleViewportTouchStartCaptureBase,
            pendingAutoFollowRef,
            viewportRef,
        ]
    )

    const handleViewportTouchMoveCapture = useCallback(
        (event: Pick<TouchEvent, 'touches'>) => {
            cancelTopAnchorTransaction()
            handleViewportTouchMoveCaptureBase(event)
        },
        [cancelTopAnchorTransaction, handleViewportTouchMoveCaptureBase]
    )

    const handleViewportScrollCapture = useCallback(() => {
        handleTopAnchorViewportScrollCapture()
        if (followModeRef.current !== 'following') {
            return
        }
        const viewport = viewportRef.current
        const currentScrollTop = viewport?.scrollTop ?? null
        const previousScrollTop = lastViewportScrollTopRef.current
        lastViewportScrollTopRef.current = currentScrollTop
        if (resolveViewportAtBottom(viewport, TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX)) {
            return
        }
        if (
            explicitBottomPendingRef.current &&
            currentScrollTop !== null &&
            previousScrollTop !== null &&
            currentScrollTop >= previousScrollTop
        ) {
            return
        }
        if (viewport && shouldIgnoreViewportScrollCapture(viewport.scrollTop)) {
            return
        }
        if (pendingAutoFollowRef.current) {
            cancelPendingAutoFollow()
        }

        clearManualScrollRestoreFrame()
        if (
            explicitBottomPendingRef.current &&
            currentScrollTop !== null &&
            previousScrollTop !== null &&
            currentScrollTop < previousScrollTop
        ) {
            const restoreTop = currentScrollTop
            manualScrollRestoreFrameRef.current = requestAnimationFrame(() => {
                manualScrollRestoreFrameRef.current = null
                if (followModeRef.current !== 'manual') {
                    return
                }

                const viewportNode = viewportRef.current
                if (!viewportNode || resolveViewportAtBottom(viewportNode, TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX)) {
                    return
                }

                if (Math.abs(viewportNode.scrollTop - restoreTop) <= 1) {
                    return
                }

                if (virtuosoRef.current?.scrollTo) {
                    virtuosoRef.current.scrollTo({
                        top: restoreTop,
                        behavior: 'auto',
                    })
                    return
                }

                viewportNode.scrollTop = restoreTop
            })
            enterManualMode(true)
        }
    }, [
        cancelPendingAutoFollow,
        clearManualScrollRestoreFrame,
        enterManualMode,
        explicitBottomPendingRef,
        followModeRef,
        handleTopAnchorViewportScrollCapture,
        pendingAutoFollowRef,
        shouldIgnoreViewportScrollCapture,
        viewportRef,
        virtuosoRef,
    ])

    const setViewportRef = useCallback(
        (viewport: HTMLDivElement | null) => {
            lastViewportScrollTopRef.current = viewport?.scrollTop ?? null
            setViewportRefBase(viewport)
        },
        [setViewportRefBase]
    )

    return {
        clearManualScrollRestoreFrame,
        handleViewportScrollCapture,
        handleViewportTouchMoveCapture,
        handleViewportTouchStartCapture,
        handleViewportWheelCapture,
        setViewportRef,
    }
}
