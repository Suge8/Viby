import type { FollowOutput } from 'react-virtuoso'
import type { TranscriptRenderRow } from '@/chat/transcriptTypes'

export type TranscriptFollowMode = 'following' | 'manual'

export const INITIAL_TRANSCRIPT_FIRST_ITEM_INDEX = 100_000
export const TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX = 4
// Generous reverse overscan keeps the rows just above the visible viewport mounted
// so fast upward scrolls do not flash the unmeasured placeholder spacer before
// virtuoso has a chance to mount + measure the real row. Tool / CLI / markdown
// rows can be much taller than the static estimates below, so we keep the reverse
// overscan large enough that a single fast wheel/touch flick still hits cached
// rows before reaching estimated placeholders.
export const TRANSCRIPT_OVERSCAN_PX = {
    main: 1600,
    reverse: 2400,
} as const
export const TRANSCRIPT_MIN_OVERSCAN_ITEM_COUNT = {
    top: 8,
    bottom: 12,
} as const
// `increaseViewportBy` renders extra rows. Keep it moderate; network prefetch
// is driven by `rangeChanged` below so we don't burn CPU mounting heavy markdown
// just to start the loader earlier.
export const TRANSCRIPT_START_REACHED_THRESHOLD_PX = 800
export const TRANSCRIPT_PREFETCH_REMAINING_ITEMS = 24
// After a prepend the scroll anchor is recomputed by virtuoso across one or two
// animation frames. During that window virtuoso's atBottom / totalListHeight
// signals are transient and must not be used to flip the controller back into
// follow mode, otherwise the viewport snaps to the new bottom mid-scroll. The
// window covers macOS trackpad inertia plus late row measurements when a tall
// markdown / tool row prepended at the top measures larger than its estimate.
export const PREPEND_SCROLL_SETTLING_MS = 320

// Height estimates feed virtuoso's initial measurement. They should sit close to
// the median real height; large deltas between estimate and real measurement are
// the dominant source of upward-scroll jumpiness because virtuoso shifts the
// scroll anchor every time a placeholder collapses into its measured size.
const USER_ROW_HEIGHT_ESTIMATE_PX = 96
const ASSISTANT_TEXT_ROW_HEIGHT_ESTIMATE_PX = 200
const ASSISTANT_REASONING_ROW_HEIGHT_ESTIMATE_PX = 120
const TOOL_ROW_HEIGHT_ESTIMATE_PX = 320
const CLI_OUTPUT_ROW_HEIGHT_ESTIMATE_PX = 320
const EVENT_ROW_HEIGHT_ESTIMATE_PX = 64
const ASSISTANT_THINKING_ROW_HEIGHT_ESTIMATE_PX = 48

export function buildTranscriptFollowOutput(mode: TranscriptFollowMode): FollowOutput {
    return (isAtBottom) => {
        if (mode !== 'following') {
            return false
        }

        return isAtBottom ? 'auto' : false
    }
}

/**
 * Stable height-estimate builder. virtuoso uses these values to seed its size
 * tree before real measurements arrive; replacing the array reference every
 * render forces virtuoso to walk through the tree to verify nothing changed,
 * which adds up on long sessions. The cache argument is owned by the
 * transcript controller (`useTranscriptVirtuoso`) so a row keeps its estimate
 * across prepend / append churn until its row.id is gone, at which point the
 * caller is responsible for evicting stale ids to bound the cache.
 */
export function buildTranscriptHeightEstimates(
    rows: readonly TranscriptRenderRow[],
    cache: Map<string, number>
): number[] {
    const estimates = new Array<number>(rows.length)
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]!
        const cached = cache.get(row.row.id)
        if (cached !== undefined) {
            estimates[index] = cached
            continue
        }
        const estimate = getTranscriptRowHeightEstimate(row)
        cache.set(row.row.id, estimate)
        estimates[index] = estimate
    }
    return estimates
}

export function evictStaleTranscriptHeightEstimates(
    rows: readonly TranscriptRenderRow[],
    cache: Map<string, number>
): void {
    if (cache.size <= rows.length) {
        return
    }
    const activeIds = new Set<string>()
    for (const row of rows) {
        activeIds.add(row.row.id)
    }
    for (const id of cache.keys()) {
        if (!activeIds.has(id)) {
            cache.delete(id)
        }
    }
}

export function resolveTranscriptDefaultItemHeight(heightEstimates: readonly number[]): number | undefined {
    if (heightEstimates.length === 0) {
        return undefined
    }

    return heightEstimates[Math.min(3, heightEstimates.length - 1)]
}

export function resolveTranscriptLastItemIndex(rowCount: number): number | null {
    if (rowCount === 0) {
        return null
    }

    return rowCount - 1
}

export function resolveActiveTurnConversationId(
    rows: readonly TranscriptRenderRow[],
    activeTurnLocalId: string | null
): string | null {
    if (!activeTurnLocalId) {
        return null
    }

    return (
        rows.find((row) => row.row.type === 'user' && row.row.block.localId === activeTurnLocalId)?.row
            .conversationId ?? null
    )
}

export function detectPrependedTranscriptRows(
    previousRows: readonly TranscriptRenderRow[],
    nextRows: readonly TranscriptRenderRow[]
): number {
    if (previousRows.length === 0 || nextRows.length === 0) {
        return 0
    }

    const nextIndexById = new Map<string, number>()
    for (let index = 0; index < nextRows.length; index += 1) {
        nextIndexById.set(nextRows[index]!.row.id, index)
    }

    const previousFirstIndex = nextIndexById.get(previousRows[0]!.row.id)
    if (previousFirstIndex !== undefined) {
        return Math.max(0, previousFirstIndex)
    }

    for (let previousIndex = 1; previousIndex < previousRows.length; previousIndex += 1) {
        const nextIndex = nextIndexById.get(previousRows[previousIndex]!.row.id)
        if (nextIndex === undefined) {
            continue
        }
        return Math.max(0, nextIndex - previousIndex)
    }

    return 0
}

export function shouldPrefetchOlderTranscriptRows(
    range: { startIndex: number; endIndex: number },
    firstItemIndex: number
): boolean {
    const absoluteOffset = range.startIndex - firstItemIndex
    const loadedStartOffset = absoluteOffset >= 0 ? absoluteOffset : range.startIndex
    return loadedStartOffset <= TRANSCRIPT_PREFETCH_REMAINING_ITEMS
}

export function resolveViewportAtBottom(viewport: HTMLElement | null, thresholdPx: number): boolean {
    if (!viewport) {
        return true
    }

    const maxOffset = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    return maxOffset - viewport.scrollTop <= thresholdPx
}

export function resolveViewportMaxOffset(viewport: HTMLElement | null): number {
    if (!viewport) {
        return 0
    }

    return Math.max(0, viewport.scrollHeight - viewport.clientHeight)
}

function getTranscriptRowHeightEstimate(row: TranscriptRenderRow): number {
    switch (row.row.type) {
        case 'user':
            return USER_ROW_HEIGHT_ESTIMATE_PX
        case 'assistant-text':
            return ASSISTANT_TEXT_ROW_HEIGHT_ESTIMATE_PX
        case 'assistant-reasoning':
            return ASSISTANT_REASONING_ROW_HEIGHT_ESTIMATE_PX
        case 'tool':
            return TOOL_ROW_HEIGHT_ESTIMATE_PX
        case 'cli-output':
            return CLI_OUTPUT_ROW_HEIGHT_ESTIMATE_PX
        case 'event':
            return EVENT_ROW_HEIGHT_ESTIMATE_PX
        case 'assistant-thinking':
            return ASSISTANT_THINKING_ROW_HEIGHT_ESTIMATE_PX
    }
}
