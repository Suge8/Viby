import type { FollowOutput, ListRange } from 'react-virtuoso'
import type { TranscriptRenderRow } from '@/chat/transcriptTypes'

export type TranscriptFollowMode = 'following' | 'manual'

export const INITIAL_TRANSCRIPT_FIRST_ITEM_INDEX = 100_000
export const TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX = 4
export const TRANSCRIPT_OVERSCAN_PX = {
    main: 480,
    reverse: 240,
} as const
export const TRANSCRIPT_MIN_OVERSCAN_ITEM_COUNT = {
    top: 4,
    bottom: 8,
} as const

const USER_ROW_HEIGHT_ESTIMATE_PX = 84
const ASSISTANT_TEXT_ROW_HEIGHT_ESTIMATE_PX = 120
const ASSISTANT_REASONING_ROW_HEIGHT_ESTIMATE_PX = 92
const TOOL_ROW_HEIGHT_ESTIMATE_PX = 176
const CLI_OUTPUT_ROW_HEIGHT_ESTIMATE_PX = 168
const EVENT_ROW_HEIGHT_ESTIMATE_PX = 64

export function buildTranscriptFollowOutput(mode: TranscriptFollowMode): FollowOutput {
    return (isAtBottom) => {
        if (mode !== 'following') {
            return false
        }

        return isAtBottom ? 'auto' : false
    }
}

export function buildTranscriptHeightEstimates(rows: readonly TranscriptRenderRow[]): number[] {
    return rows.map((row) => getTranscriptRowHeightEstimate(row))
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
    if (previousRows.length === 0 || nextRows.length <= previousRows.length) {
        return 0
    }

    const previousFirstRowId = previousRows[0]?.row.id
    if (!previousFirstRowId) {
        return 0
    }

    const previousFirstRowIndex = nextRows.findIndex((row) => row.row.id === previousFirstRowId)
    if (previousFirstRowIndex <= 0) {
        return 0
    }

    for (let index = 0; index < previousRows.length; index += 1) {
        const previousRow = previousRows[index]
        const nextRow = nextRows[previousFirstRowIndex + index]
        if (!previousRow || !nextRow || previousRow.row.id !== nextRow.row.id) {
            return 0
        }
    }

    return previousFirstRowIndex
}

export function resolvePreviousUserConversationId(options: {
    conversationIds: readonly string[]
    historyJumpTargetConversationIds: readonly string[]
    referenceConversationId: string | null
}): string | null {
    if (!options.referenceConversationId) {
        return null
    }

    const jumpTargets = new Set(options.historyJumpTargetConversationIds)
    const referenceIndex = options.conversationIds.indexOf(options.referenceConversationId)
    if (referenceIndex <= 0) {
        return null
    }

    for (let index = referenceIndex - 1; index >= 0; index -= 1) {
        const candidateId = options.conversationIds[index]
        if (candidateId && jumpTargets.has(candidateId)) {
            return candidateId
        }
    }

    return null
}

export function resolveTranscriptTopConversationId(options: {
    rows: readonly TranscriptRenderRow[]
    firstItemIndex: number
    range: ListRange
}): string | null {
    if (options.rows.length === 0) {
        return null
    }

    const rowIndex = Math.max(0, options.range.startIndex - options.firstItemIndex)
    return options.rows[rowIndex]?.row.conversationId ?? options.rows[0]?.row.conversationId ?? null
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
    }
}
