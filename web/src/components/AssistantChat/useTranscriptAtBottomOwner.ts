import { type MutableRefObject, type RefObject, useCallback, useRef } from 'react'
import {
    resolveViewportAtBottom,
    TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX,
    type TranscriptFollowMode,
} from './transcriptScrollPolicy'

type UseTranscriptAtBottomOwnerOptions = {
    explicitBottomPendingRef: MutableRefObject<boolean>
    followModeRef: MutableRefObject<TranscriptFollowMode>
    isTopAnchorTransactionPending: () => boolean
    measuredAtBottomRef: MutableRefObject<boolean>
    pendingAutoFollowRef: MutableRefObject<boolean>
    reportAtBottom: (atBottom: boolean) => void
    requestExplicitBottom: () => void
    resetExplicitBottomState: () => void
    runExplicitBottomTransaction: () => void
    scheduleAutoScrollToBottom: () => void
    setFollowMode: (nextMode: TranscriptFollowMode) => void
    viewportRef: RefObject<HTMLDivElement | null>
}

type UseTranscriptAtBottomOwnerResult = {
    handleAtBottomStateChange: (atBottom: boolean) => void
    handleTotalListHeightChanged: () => void
}

type UseTranscriptAtBottomSignalOptions = {
    onAtBottomChange: (atBottom: boolean) => void
    onFlushPending: () => void
}

type UseTranscriptAtBottomSignalResult = {
    measuredAtBottomRef: MutableRefObject<boolean>
    reportAtBottom: (atBottom: boolean) => void
}

export function useTranscriptAtBottomSignal(
    options: UseTranscriptAtBottomSignalOptions
): UseTranscriptAtBottomSignalResult {
    const onAtBottomChangeRef = useRef(options.onAtBottomChange)
    const onFlushPendingRef = useRef(options.onFlushPending)
    const reportedAtBottomRef = useRef(true)
    const measuredAtBottomRef = useRef(true)

    onAtBottomChangeRef.current = options.onAtBottomChange
    onFlushPendingRef.current = options.onFlushPending

    const reportAtBottom = useCallback((atBottom: boolean) => {
        measuredAtBottomRef.current = atBottom
        if (reportedAtBottomRef.current === atBottom) {
            return
        }

        reportedAtBottomRef.current = atBottom
        onAtBottomChangeRef.current(atBottom)
        if (atBottom) {
            onFlushPendingRef.current()
        }
    }, [])

    return {
        measuredAtBottomRef,
        reportAtBottom,
    }
}

export function useTranscriptAtBottomOwner(
    options: UseTranscriptAtBottomOwnerOptions
): UseTranscriptAtBottomOwnerResult {
    const {
        explicitBottomPendingRef,
        followModeRef,
        isTopAnchorTransactionPending,
        measuredAtBottomRef,
        pendingAutoFollowRef,
        reportAtBottom,
        requestExplicitBottom,
        resetExplicitBottomState,
        runExplicitBottomTransaction,
        scheduleAutoScrollToBottom,
        setFollowMode,
        viewportRef,
    } = options
    const handleAtBottomStateChange = useCallback(
        (atBottom: boolean) => {
            const actualAtBottom =
                viewportRef.current === null
                    ? atBottom
                    : resolveViewportAtBottom(viewportRef.current, TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX)
            if (isTopAnchorTransactionPending()) {
                if (!atBottom) {
                    reportAtBottom(false)
                }
                return
            }

            if (atBottom) {
                if (!actualAtBottom && !explicitBottomPendingRef.current && !pendingAutoFollowRef.current) {
                    setFollowMode('manual')
                    reportAtBottom(false)
                    return
                }
                if (explicitBottomPendingRef.current) {
                    if (viewportRef.current) {
                        runExplicitBottomTransaction()
                    }
                    return
                }

                pendingAutoFollowRef.current = false
                explicitBottomPendingRef.current = false
                resetExplicitBottomState()
                setFollowMode('following')
                reportAtBottom(true)
                return
            }

            if (pendingAutoFollowRef.current || explicitBottomPendingRef.current) {
                return
            }

            if (followModeRef.current === 'following') {
                scheduleAutoScrollToBottom()
                return
            }

            reportAtBottom(false)
        },
        [
            explicitBottomPendingRef,
            followModeRef,
            isTopAnchorTransactionPending,
            pendingAutoFollowRef,
            reportAtBottom,
            resetExplicitBottomState,
            runExplicitBottomTransaction,
            scheduleAutoScrollToBottom,
            setFollowMode,
            viewportRef,
        ]
    )

    const handleTotalListHeightChanged = useCallback(() => {
        if (explicitBottomPendingRef.current) {
            runExplicitBottomTransaction()
            return
        }

        if (followModeRef.current === 'following') {
            requestExplicitBottom()
            return
        }

        if (!measuredAtBottomRef.current) {
            return
        }

        scheduleAutoScrollToBottom()
    }, [
        explicitBottomPendingRef,
        followModeRef,
        requestExplicitBottom,
        runExplicitBottomTransaction,
        scheduleAutoScrollToBottom,
        viewportRef,
    ])

    return {
        handleAtBottomStateChange,
        handleTotalListHeightChanged,
    }
}
