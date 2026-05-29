import { type MutableRefObject, useCallback, useRef } from 'react'

type UseTranscriptStartReachedOwnerOptions = {
    hasMoreHistory: boolean
    /**
     * Reverse infinite-scroll prefetch must stay silent until virtuoso has
     * actually settled at the entry-bottom. On slow devices the mount-time
     * `initialTopMostItemIndex` scroll can briefly land inside the prefetch
     * window (first ~24 rows), causing `rangeChanged` to fire `startReached`
     * over and over and pull dozens of history pages in a runaway loop — the
     * exact “viewport stuck near the top of the timeline” symptom users hit.
     * The gate ref is owned by `useTranscriptVirtuoso` so the single settled
     * signal blocks both follow-mode auto-scroll and history prefetch.
     */
    hasSettledInitialBottomRef: MutableRefObject<boolean>
    /**
     * Being at the bottom is not a history intent. Large desktop/mobile
     * viewports can render enough overscan that Virtuoso reports a range near
     * the loaded-window start immediately after entry-bottom settles; if we
     * load older history there, entry silently prepends rows and steals the
     * bottom-pin owner. Automatic reverse loading only starts after the user
     * leaves bottom. Explicit outline "show earlier" calls bypass this owner.
     */
    measuredAtBottomRef: MutableRefObject<boolean>
    onLoadOlderHistory: () => Promise<unknown> | void
}

/**
 * Single-flight owner for `react-virtuoso`'s `startReached` reverse infinite
 * scroll callback. Virtuoso fires the callback repeatedly while the viewport
 * sits near the top of the loaded window, so we must guarantee at most one
 * concurrent loader invocation; otherwise a slow REST round-trip would queue
 * duplicate batches. The latest `hasMoreHistory` / `onLoadOlderHistory`
 * snapshots are kept in refs so the returned handler can stay identity-stable
 * across rerenders and never detach the virtuoso subscription.
 */
export function useTranscriptStartReachedOwner(options: UseTranscriptStartReachedOwnerOptions): () => void {
    const inFlightRef = useRef(false)
    const hasMoreRef = useRef(options.hasMoreHistory)
    const loaderRef = useRef(options.onLoadOlderHistory)
    hasMoreRef.current = options.hasMoreHistory
    loaderRef.current = options.onLoadOlderHistory

    const settledRef = options.hasSettledInitialBottomRef
    const atBottomRef = options.measuredAtBottomRef

    return useCallback(() => {
        if (inFlightRef.current || !hasMoreRef.current || !settledRef.current || atBottomRef.current) {
            return
        }
        inFlightRef.current = true
        const result = loaderRef.current()
        const isPromise =
            result !== null &&
            typeof result === 'object' &&
            typeof (result as { finally?: unknown }).finally === 'function'
        if (!isPromise) {
            inFlightRef.current = false
            return
        }
        ;(result as Promise<unknown>).finally(() => {
            inFlightRef.current = false
        })
    }, [atBottomRef, settledRef])
}
