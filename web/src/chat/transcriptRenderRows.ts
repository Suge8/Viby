import {
    THINKING_ROW_CONVERSATION_ID,
    THINKING_ROW_ID,
    type TranscriptAssistantThinkingRow,
    type TranscriptRenderRow,
    type TranscriptRow,
    type TranscriptRowGap,
} from '@/chat/transcriptTypes'
import type { AssistantReplyingPhase } from '@/components/AssistantChat/assistantReplyingPhase'

function isNoticeLikeRow(row: TranscriptRow): boolean {
    return row.type === 'event'
}

function isAssistantClusterRow(row: TranscriptRow): boolean {
    return (
        row.type === 'assistant-text' ||
        row.type === 'assistant-reasoning' ||
        row.type === 'tool' ||
        row.type === 'cli-output' ||
        row.type === 'assistant-thinking'
    )
}

export function resolveTranscriptRowGap(currentRow: TranscriptRow, nextRow: TranscriptRow | null): TranscriptRowGap {
    if (!nextRow) {
        return 'none'
    }

    if (isNoticeLikeRow(currentRow) || isNoticeLikeRow(nextRow)) {
        return 'loose'
    }

    if (isAssistantClusterRow(currentRow) && isAssistantClusterRow(nextRow)) {
        return 'compact'
    }

    return 'base'
}

export function buildTranscriptRenderRows(rows: readonly TranscriptRow[]): TranscriptRenderRow[] {
    return rows.map((row, index) => ({
        row,
        gap: resolveTranscriptRowGap(row, rows[index + 1] ?? null),
    }))
}

function buildThinkingRow(phase: AssistantReplyingPhase): TranscriptAssistantThinkingRow {
    return {
        id: THINKING_ROW_ID,
        type: 'assistant-thinking',
        conversationId: THINKING_ROW_CONVERSATION_ID,
        depth: 0,
        copyText: null,
        phase,
    }
}

export function injectThinkingRenderRow(
    renderRows: readonly TranscriptRenderRow[],
    phase: AssistantReplyingPhase | null
): readonly TranscriptRenderRow[] {
    if (!phase) {
        return renderRows
    }

    const thinkingRow = buildThinkingRow(phase)
    const lastIndex = renderRows.length - 1
    if (lastIndex < 0) {
        return [{ row: thinkingRow, gap: 'none' }]
    }

    const last = renderRows[lastIndex]
    return [
        ...renderRows.slice(0, lastIndex),
        { row: last.row, gap: resolveTranscriptRowGap(last.row, thinkingRow) },
        { row: thinkingRow, gap: 'none' },
    ]
}
