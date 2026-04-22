import type { TranscriptRenderRow, TranscriptRow, TranscriptRowGap } from '@/chat/transcriptTypes'

function isNoticeLikeRow(row: TranscriptRow): boolean {
    return row.type === 'event'
}

function isAssistantClusterRow(row: TranscriptRow): boolean {
    return (
        row.type === 'assistant-text' ||
        row.type === 'assistant-reasoning' ||
        row.type === 'tool' ||
        row.type === 'cli-output'
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
