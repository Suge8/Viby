import { type MutableRefObject, type RefObject, useCallback, useRef } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import {
    resolveViewportAtBottom,
    resolveViewportMaxOffset,
    TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX,
    type TranscriptFollowMode,
} from './transcriptScrollPolicy'

const EXPLICIT_BOTTOM_SETTLE_FRAME_LIMIT = 24
const EXPLICIT_BOTTOM_STALL_FRAME_LIMIT = 120

type ExplicitBottomBehavior = 'auto' | 'smooth'

type ViewportBottomSnapshot = {
    maxOffset: number
    scrollTop: number
}

function readViewportBottomSnapshot(viewport: HTMLElement | null): ViewportBottomSnapshot | null {
    if (!viewport) {
        return null
    }

    return {
        maxOffset: resolveViewportMaxOffset(viewport),
        scrollTop: viewport.scrollTop,
    }
}

export function useTranscriptExplicitBottom(options: {
    followModeRef: MutableRefObject<TranscriptFollowMode>
    initialPending: boolean
    reportAtBottom: (atBottom: boolean) => void
    setFollowMode: (nextMode: TranscriptFollowMode) => void
    viewportRef: RefObject<HTMLDivElement | null>
    virtuosoRef: RefObject<VirtuosoHandle | null>
}) {
    const { followModeRef, reportAtBottom, setFollowMode, viewportRef, virtuosoRef } = options
    const pendingAutoFollowRef = useRef(false)
    const explicitBottomFrameRef = useRef<number | null>(null)
    const explicitBottomPendingRef = useRef(options.initialPending)
    const explicitBottomStableFrameCountRef = useRef(0)
    const explicitBottomSnapshotRef = useRef<ViewportBottomSnapshot | null>(null)
    const explicitBottomBehaviorRef = useRef<ExplicitBottomBehavior>('auto')
    const explicitBottomProgrammaticScrollRef = useRef(false)
    const reportAtBottomRef = useRef(reportAtBottom)
    const setFollowModeRef = useRef(setFollowMode)

    reportAtBottomRef.current = reportAtBottom
    setFollowModeRef.current = setFollowMode

    const clearExplicitBottomFrame = useCallback(() => {
        if (explicitBottomFrameRef.current !== null) {
            cancelAnimationFrame(explicitBottomFrameRef.current)
            explicitBottomFrameRef.current = null
        }
    }, [])

    const clearExplicitBottomProgrammaticScrollGuard = useCallback(() => {
        explicitBottomProgrammaticScrollRef.current = false
    }, [])

    const resetExplicitBottomState = useCallback(() => {
        explicitBottomStableFrameCountRef.current = 0
        explicitBottomSnapshotRef.current = null
    }, [])

    const abortExplicitBottomTransaction = useCallback(() => {
        explicitBottomPendingRef.current = false
        pendingAutoFollowRef.current = false
        clearExplicitBottomFrame()
        clearExplicitBottomProgrammaticScrollGuard()
        resetExplicitBottomState()
        setFollowModeRef.current('manual')
        reportAtBottomRef.current(false)
    }, [clearExplicitBottomFrame, clearExplicitBottomProgrammaticScrollGuard, resetExplicitBottomState])

    const finishExplicitBottomTransaction = useCallback(
        (atBottom: boolean) => {
            explicitBottomPendingRef.current = false
            pendingAutoFollowRef.current = false
            clearExplicitBottomProgrammaticScrollGuard()
            resetExplicitBottomState()
            reportAtBottomRef.current(atBottom)
        },
        [clearExplicitBottomProgrammaticScrollGuard, resetExplicitBottomState]
    )

    const scrollToViewportEnd = useCallback(
        (behavior: ExplicitBottomBehavior) => {
            const handle = virtuosoRef.current
            const viewport = viewportRef.current
            if (!handle || !viewport) {
                return
            }

            clearExplicitBottomProgrammaticScrollGuard()
            explicitBottomProgrammaticScrollRef.current = true
            handle.scrollTo({
                top: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
                behavior,
            })
        },
        [clearExplicitBottomProgrammaticScrollGuard, viewportRef, virtuosoRef]
    )

    const runExplicitBottomTransaction = useCallback(() => {
        if (!explicitBottomPendingRef.current || followModeRef.current !== 'following') {
            return
        }
        if (explicitBottomFrameRef.current !== null) {
            return
        }

        const tick = () => {
            explicitBottomFrameRef.current = null
            if (!explicitBottomPendingRef.current || followModeRef.current !== 'following') {
                return
            }

            const viewport = viewportRef.current
            if (!viewport || !virtuosoRef.current) {
                return
            }

            const beforeSnapshot = readViewportBottomSnapshot(viewport)
            const previousSnapshot = explicitBottomSnapshotRef.current
            const sameSnapshot =
                beforeSnapshot &&
                previousSnapshot &&
                beforeSnapshot.maxOffset === previousSnapshot.maxOffset &&
                beforeSnapshot.scrollTop === previousSnapshot.scrollTop

            if (beforeSnapshot && previousSnapshot && beforeSnapshot.scrollTop < previousSnapshot.scrollTop) {
                abortExplicitBottomTransaction()
                return
            }

            if (resolveViewportAtBottom(viewport, TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX)) {
                explicitBottomSnapshotRef.current = beforeSnapshot
                explicitBottomStableFrameCountRef.current = sameSnapshot
                    ? explicitBottomStableFrameCountRef.current + 1
                    : 0
                if (explicitBottomStableFrameCountRef.current >= EXPLICIT_BOTTOM_SETTLE_FRAME_LIMIT) {
                    finishExplicitBottomTransaction(true)
                    return
                }

                explicitBottomFrameRef.current = requestAnimationFrame(tick)
                return
            }

            pendingAutoFollowRef.current = true
            scrollToViewportEnd(explicitBottomBehaviorRef.current)
            explicitBottomBehaviorRef.current = 'auto'

            const nextSnapshot = readViewportBottomSnapshot(viewport)
            const didProgress =
                beforeSnapshot &&
                nextSnapshot &&
                (beforeSnapshot.maxOffset !== nextSnapshot.maxOffset ||
                    beforeSnapshot.scrollTop !== nextSnapshot.scrollTop)
            explicitBottomSnapshotRef.current = nextSnapshot
            explicitBottomStableFrameCountRef.current = didProgress ? 0 : explicitBottomStableFrameCountRef.current + 1

            if (explicitBottomStableFrameCountRef.current >= EXPLICIT_BOTTOM_STALL_FRAME_LIMIT) {
                finishExplicitBottomTransaction(resolveViewportAtBottom(viewport, TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX))
                return
            }

            explicitBottomFrameRef.current = requestAnimationFrame(tick)
        }

        explicitBottomFrameRef.current = requestAnimationFrame(tick)
    }, [
        abortExplicitBottomTransaction,
        finishExplicitBottomTransaction,
        followModeRef,
        scrollToViewportEnd,
        viewportRef,
        virtuosoRef,
    ])

    const startExplicitBottomTransaction = useCallback(
        (behavior: ExplicitBottomBehavior) => {
            explicitBottomBehaviorRef.current = behavior
            explicitBottomPendingRef.current = true
            pendingAutoFollowRef.current = true
            resetExplicitBottomState()
            explicitBottomSnapshotRef.current = readViewportBottomSnapshot(viewportRef.current)
            setFollowModeRef.current('following')
            runExplicitBottomTransaction()
        },
        [resetExplicitBottomState, runExplicitBottomTransaction, viewportRef]
    )

    const cancelExplicitBottomTransaction = useCallback(() => {
        explicitBottomPendingRef.current = false
        pendingAutoFollowRef.current = false
        clearExplicitBottomFrame()
        clearExplicitBottomProgrammaticScrollGuard()
        resetExplicitBottomState()
    }, [clearExplicitBottomFrame, clearExplicitBottomProgrammaticScrollGuard, resetExplicitBottomState])

    const setViewportRef = useCallback(
        (viewport: HTMLDivElement | null) => {
            viewportRef.current = viewport
            if (viewport && explicitBottomPendingRef.current) {
                runExplicitBottomTransaction()
            }
        },
        [runExplicitBottomTransaction, viewportRef]
    )

    const setVirtuosoRef = useCallback(
        (handle: VirtuosoHandle | null) => {
            virtuosoRef.current = handle
            if (handle && explicitBottomPendingRef.current) {
                runExplicitBottomTransaction()
            }
        },
        [runExplicitBottomTransaction, virtuosoRef]
    )

    return {
        cancelExplicitBottomTransaction,
        clearExplicitBottomFrame,
        explicitBottomPendingRef,
        pendingAutoFollowRef,
        runExplicitBottomTransaction,
        setViewportRef,
        setVirtuosoRef,
        startExplicitBottomTransaction,
        resetExplicitBottomState,
        isExplicitBottomProgrammaticScrollPending: () => explicitBottomProgrammaticScrollRef.current,
        shouldIgnoreViewportScrollCapture: (scrollTop: number) => {
            if (!explicitBottomPendingRef.current) {
                return false
            }

            const lastSnapshot = explicitBottomSnapshotRef.current
            if (!lastSnapshot) {
                return explicitBottomProgrammaticScrollRef.current
            }

            return scrollTop >= lastSnapshot.scrollTop
        },
    }
}
