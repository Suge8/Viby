import { useCallback, useEffect, useRef } from 'react'
import {
    findThreadAnchorElement,
    getCurrentTopThreadAnchorId,
} from '@/components/AssistantChat/threadViewportAnchors'

export type PendingScrollSnapshot = {
    topAnchorId: string | null
    topAnchorOffset: number
    scrollTop: number
}

type PendingMessageAlignment = {
    mode: 'snapshot' | 'bottom' | 'message'
    frameId: number | null
    resizeObserver: ResizeObserver | null
    mutationObserver: MutationObserver | null
    timeoutId: number | null
}

type UseThreadViewportAlignmentOptions = {
    orderedMessageIds: readonly string[]
    viewportTopEdgeEpsilonPx: number
    messageAlignmentEpsilonPx: number
    viewportBottomEdgeEpsilonPx: number
    trackingMs: number
}

type UseThreadViewportAlignmentResult = {
    cancelPendingMessageAlignment: () => void
    isBottomAlignmentPending: () => boolean
    capturePendingScrollSnapshot: (viewport: HTMLDivElement, viewportTopEdgePx: number) => PendingScrollSnapshot
    restorePendingScrollSnapshot: (viewport: HTMLDivElement, snapshot: PendingScrollSnapshot) => void
    trackThreadMessageAlignment: (viewport: HTMLDivElement, messageId: string) => boolean
    stickToViewportBottom: (viewport: HTMLDivElement) => void
}

const MESSAGE_ALIGNMENT_MUTATION_OBSERVER_OPTIONS: MutationObserverInit = {
    childList: true,
    subtree: true
}

function getElementTopOffset(viewport: HTMLDivElement, element: HTMLElement): number {
    return element.getBoundingClientRect().top - viewport.getBoundingClientRect().top
}

function alignThreadMessageToViewportTop(
    viewport: HTMLDivElement,
    messageElement: HTMLElement,
    messageAlignmentEpsilonPx: number
): void {
    const offsetDelta = getElementTopOffset(viewport, messageElement)
    if (Math.abs(offsetDelta) <= messageAlignmentEpsilonPx) {
        return
    }

    viewport.scrollTop = Math.max(0, viewport.scrollTop + offsetDelta)
}

function isMessageAlignedToViewportTop(
    viewport: HTMLDivElement,
    messageElement: HTMLElement,
    messageAlignmentEpsilonPx: number
): boolean {
    const viewportTop = viewport.getBoundingClientRect().top
    const messageTop = messageElement.getBoundingClientRect().top
    return Math.abs(messageTop - viewportTop) <= messageAlignmentEpsilonPx
}

function canMeasureViewportLayout(viewport: HTMLDivElement): boolean {
    return viewport.clientHeight > 0 && viewport.scrollHeight > 0
}

export function useThreadViewportAlignment(
    options: UseThreadViewportAlignmentOptions
): UseThreadViewportAlignmentResult {
    const pendingMessageAlignmentRef = useRef<PendingMessageAlignment | null>(null)

    const syncThreadMessageAlignment = useCallback((
        viewport: HTMLDivElement,
        messageId: string
    ): boolean => {
        const messageElement = findThreadAnchorElement(viewport, options.orderedMessageIds, messageId)
        if (!messageElement) {
            return false
        }

        if (isMessageAlignedToViewportTop(viewport, messageElement, options.messageAlignmentEpsilonPx)) {
            return true
        }

        alignThreadMessageToViewportTop(viewport, messageElement, options.messageAlignmentEpsilonPx)
        return true
    }, [options.messageAlignmentEpsilonPx, options.orderedMessageIds])

    const cancelPendingMessageAlignment = useCallback((): void => {
        const pendingAlignment = pendingMessageAlignmentRef.current
        if (!pendingAlignment) {
            return
        }

        if (pendingAlignment.frameId !== null) {
            cancelAnimationFrame(pendingAlignment.frameId)
        }
        if (pendingAlignment.timeoutId !== null) {
            window.clearTimeout(pendingAlignment.timeoutId)
        }
        pendingAlignment.resizeObserver?.disconnect()
        pendingAlignment.mutationObserver?.disconnect()
        pendingMessageAlignmentRef.current = null
    }, [])

    const isBottomAlignmentPending = useCallback((): boolean => {
        return pendingMessageAlignmentRef.current?.mode === 'bottom'
    }, [])

    const startPendingMessageAlignment = useCallback((
        mode: PendingMessageAlignment['mode'],
        viewport: HTMLDivElement,
        syncAlignment: () => void,
        runtimeOptions?: {
            observeMutations?: boolean
        }
    ): void => {
        cancelPendingMessageAlignment()

        const pendingAlignment: PendingMessageAlignment = {
            mode,
            frameId: null,
            resizeObserver: null,
            mutationObserver: null,
            timeoutId: null
        }
        pendingMessageAlignmentRef.current = pendingAlignment

        function restartTrackingWindow(): void {
            if (pendingMessageAlignmentRef.current !== pendingAlignment) {
                return
            }

            if (pendingAlignment.timeoutId !== null) {
                window.clearTimeout(pendingAlignment.timeoutId)
            }

            pendingAlignment.timeoutId = window.setTimeout(() => {
                if (pendingMessageAlignmentRef.current !== pendingAlignment) {
                    return
                }

                cancelPendingMessageAlignment()
            }, options.trackingMs)
        }

        function scheduleAlignment(): void {
            if (pendingMessageAlignmentRef.current !== pendingAlignment || pendingAlignment.frameId !== null) {
                return
            }

            pendingAlignment.frameId = requestAnimationFrame(() => {
                pendingAlignment.frameId = null
                if (pendingMessageAlignmentRef.current !== pendingAlignment) {
                    return
                }

                syncAlignment()
            })
        }

        syncAlignment()
        restartTrackingWindow()
        scheduleAlignment()

        const resizeObserver = new ResizeObserver(() => {
            restartTrackingWindow()
            scheduleAlignment()
        })
        resizeObserver.observe(viewport)

        const contentRoot = viewport.firstElementChild
        if (contentRoot instanceof HTMLElement && contentRoot !== viewport) {
            resizeObserver.observe(contentRoot)
        }

        pendingAlignment.resizeObserver = resizeObserver

        if (mode !== 'message' || runtimeOptions?.observeMutations !== true) {
            return
        }

        const mutationRoot = contentRoot instanceof HTMLElement ? contentRoot : viewport
        const mutationObserver = new MutationObserver(() => {
            restartTrackingWindow()
            scheduleAlignment()
        })
        mutationObserver.observe(mutationRoot, MESSAGE_ALIGNMENT_MUTATION_OBSERVER_OPTIONS)
        pendingAlignment.mutationObserver = mutationObserver
    }, [cancelPendingMessageAlignment, options.trackingMs])

    const capturePendingScrollSnapshot = useCallback((
        viewport: HTMLDivElement,
        viewportTopEdgePx: number
    ): PendingScrollSnapshot => {
        const topAnchorId = getCurrentTopThreadAnchorId({
            viewport,
            orderedMessageIds: options.orderedMessageIds,
            viewportTopEdgePx
        })
        if (!topAnchorId) {
            return {
                topAnchorId: null,
                topAnchorOffset: 0,
                scrollTop: viewport.scrollTop
            }
        }

        const topAnchorElement = findThreadAnchorElement(viewport, options.orderedMessageIds, topAnchorId)
        if (!topAnchorElement) {
            return {
                topAnchorId: null,
                topAnchorOffset: 0,
                scrollTop: viewport.scrollTop
            }
        }

        return {
            topAnchorId,
            topAnchorOffset: getElementTopOffset(viewport, topAnchorElement),
            scrollTop: viewport.scrollTop
        }
    }, [options.orderedMessageIds])

    const restorePendingScrollSnapshot = useCallback((
        viewport: HTMLDivElement,
        snapshot: PendingScrollSnapshot
    ): void => {
        startPendingMessageAlignment('snapshot', viewport, () => {
            const topAnchorId = snapshot.topAnchorId
            if (!topAnchorId) {
                if (viewport.scrollTop !== snapshot.scrollTop) {
                    viewport.scrollTop = snapshot.scrollTop
                }
                return
            }

            const topAnchorElement = findThreadAnchorElement(viewport, options.orderedMessageIds, topAnchorId)
            if (!topAnchorElement) {
                if (viewport.scrollTop !== snapshot.scrollTop) {
                    viewport.scrollTop = snapshot.scrollTop
                }
                return
            }

            const offsetDelta = getElementTopOffset(viewport, topAnchorElement) - snapshot.topAnchorOffset
            if (Math.abs(offsetDelta) <= options.viewportTopEdgeEpsilonPx) {
                return
            }

            viewport.scrollTop = Math.max(0, viewport.scrollTop + offsetDelta)
        })
    }, [options.orderedMessageIds, options.viewportTopEdgeEpsilonPx, startPendingMessageAlignment])

    const trackThreadMessageAlignment = useCallback((
        viewport: HTMLDivElement,
        messageId: string
    ): boolean => {
        if (!options.orderedMessageIds.includes(messageId)) {
            return false
        }

        const shouldObserveMutations = findThreadAnchorElement(viewport, options.orderedMessageIds, messageId) === null
        startPendingMessageAlignment('message', viewport, () => {
            syncThreadMessageAlignment(viewport, messageId)
        }, {
            observeMutations: shouldObserveMutations
        })
        return true
    }, [options.orderedMessageIds, startPendingMessageAlignment, syncThreadMessageAlignment])

    const stickToViewportBottom = useCallback((viewport: HTMLDivElement): void => {
        if (!canMeasureViewportLayout(viewport)) {
            return
        }

        startPendingMessageAlignment('bottom', viewport, () => {
            const bottomScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
            if (Math.abs(viewport.scrollTop - bottomScrollTop) <= options.viewportBottomEdgeEpsilonPx) {
                return
            }

            viewport.scrollTop = bottomScrollTop
        })
    }, [options.viewportBottomEdgeEpsilonPx, startPendingMessageAlignment])

    useEffect(() => {
        return () => {
            cancelPendingMessageAlignment()
        }
    }, [cancelPendingMessageAlignment])

    return {
        cancelPendingMessageAlignment,
        isBottomAlignmentPending,
        capturePendingScrollSnapshot,
        restorePendingScrollSnapshot,
        trackThreadMessageAlignment,
        stickToViewportBottom
    }
}
