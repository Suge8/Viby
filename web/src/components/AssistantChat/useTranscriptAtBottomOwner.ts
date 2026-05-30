import { type MutableRefObject, type RefObject, useCallback, useRef } from 'react'
import {
    resolveViewportAtBottom,
    TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX,
    type TranscriptFollowMode,
} from './transcriptScrollPolicy'

type UseTranscriptAtBottomOwnerOptions = {
    explicitBottomPendingRef: MutableRefObject<boolean>
    followModeRef: MutableRefObject<TranscriptFollowMode>
    /**
     * Flipped to true on the first virtuoso `atBottom: true` after mount.
     * Until then `initialTopMostItemIndex` owns the entry scroll: our own
     * `scheduleAutoScrollToBottom` calls would race virtuoso's settle pass and
     * land the viewport in random middle positions on session entry. After
     * settling we can safely manage follow-mode auto-scroll as usual.
     */
    hasSettledInitialBottomRef: MutableRefObject<boolean>
    isTopAnchorTransactionPending: () => boolean
    /**
     * Returns true when an older-history prepend just landed and virtuoso's
     * atBottom / totalListHeight signals should not be allowed to flip us back
     * into follow mode. Virtuoso recomputes scroll anchor across the same
     * frame, and during that brief window it can transiently report
     * `atBottom=true` even though the user is reading earlier content. The
     * sticky window is owned by the transcript controller (`useTranscriptVirtuoso`).
     */
    isPrependScrollSettling: () => boolean
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
        hasSettledInitialBottomRef,
        isTopAnchorTransactionPending,
        isPrependScrollSettling,
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
                return
            }

            if (atBottom) {
                if (explicitBottomPendingRef.current) {
                    if (viewportRef.current) {
                        runExplicitBottomTransaction()
                    }
                    return
                }
                // While a prepend is still settling, virtuoso's atBottom signal
                // is unreliable: it momentarily reports we are at the tail while
                // it shifts the scroll anchor for newly prepended rows. Flipping
                // back into follow mode here would yank the viewport to the
                // bottom mid-scroll — exactly the "messages blank out then snap
                // to bottom" symptom users reported on fast upward scroll.
                if (isPrependScrollSettling()) {
                    reportAtBottom(actualAtBottom)
                    return
                }

                if (!actualAtBottom) {
                    if (!hasSettledInitialBottomRef.current) {
                        requestExplicitBottom()
                        reportAtBottom(false)
                        return
                    }
                    if (!pendingAutoFollowRef.current) {
                        setFollowMode('manual')
                        reportAtBottom(false)
                        return
                    }
                }

                pendingAutoFollowRef.current = false
                explicitBottomPendingRef.current = false
                resetExplicitBottomState()
                setFollowMode('following')
                reportAtBottom(true)
                hasSettledInitialBottomRef.current = true
                return
            }

            if (pendingAutoFollowRef.current || explicitBottomPendingRef.current) {
                return
            }

            // Virtuoso fires interim `atBottom: false` while it is still
            // executing the mount-time `initialTopMostItemIndex` scroll. Posting
            // our own auto-scroll then would race virtuoso's settle pass and
            // can leave the viewport in a random middle position; defer until
            // the first `atBottom: true` confirms virtuoso owns a stable bottom.
            if (!hasSettledInitialBottomRef.current) {
                reportAtBottom(false)
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
            hasSettledInitialBottomRef,
            isPrependScrollSettling,
            isTopAnchorTransactionPending,
            pendingAutoFollowRef,
            reportAtBottom,
            requestExplicitBottom,
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

        // Active top-anchor transaction owns the scrollTop; any auto bottom
        // follow here (including the spurious one caused by `applyActiveTurn-
        // Headroom` growing the bottom spacer and momentarily keeping
        // `measuredAtBottomRef === true`) would overwrite the anchor and push
        // the user's just-sent turn out of the viewport.
        if (isTopAnchorTransactionPending()) {
            return
        }

        // Prepend grows the total list height as soon as new rows mount and
        // measure; if we treated that as "the tail just grew, follow it" we
        // would scroll the viewport to the new bottom while the user is still
        // reading older history. The prepend settling window is owned by the
        // transcript controller and protects every follow-on auto-scroll path.
        if (isPrependScrollSettling()) {
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
        isPrependScrollSettling,
        isTopAnchorTransactionPending,
        measuredAtBottomRef,
        requestExplicitBottom,
        runExplicitBottomTransaction,
        scheduleAutoScrollToBottom,
    ])

    return {
        handleAtBottomStateChange,
        handleTotalListHeightChanged,
    }
}
