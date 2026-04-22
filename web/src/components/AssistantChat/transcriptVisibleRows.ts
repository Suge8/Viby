import { TRANSCRIPT_ROW_SELECTOR } from '@/lib/sessionUiContracts'
import { readTranscriptTopAnchorLinePx } from './transcriptAnchorGeometry'

function isVisibleConversationRow(row: HTMLElement, viewportTop: number, viewportBottom: number): boolean {
    const rect = row.getBoundingClientRect()
    return rect.bottom > viewportTop && rect.top < viewportBottom
}

export function resolveVisibleTranscriptConversationId(options: { viewport: HTMLDivElement | null }): string | null {
    const { viewport } = options
    if (!viewport) {
        return null
    }

    const rows = [...viewport.querySelectorAll<HTMLElement>(TRANSCRIPT_ROW_SELECTOR)]
    if (rows.length === 0) {
        return null
    }

    const viewportRect = viewport.getBoundingClientRect()
    const viewportTop = readTranscriptTopAnchorLinePx(viewport) + 1
    const viewportBottom = viewportRect.bottom

    const firstVisibleRow = rows.find((row) => isVisibleConversationRow(row, viewportTop, viewportBottom))
    return firstVisibleRow?.dataset.conversationId ?? rows[0]?.dataset.conversationId ?? null
}

export function resolveVisibleTranscriptHistoryJumpTargetConversationId(options: {
    viewport: HTMLDivElement | null
}): string | null {
    const { viewport } = options
    if (!viewport) {
        return null
    }

    const rows = [
        ...viewport.querySelectorAll<HTMLElement>(`${TRANSCRIPT_ROW_SELECTOR}[data-history-jump-target="true"]`),
    ]
    if (rows.length === 0) {
        return null
    }

    const viewportRect = viewport.getBoundingClientRect()
    const viewportTop = readTranscriptTopAnchorLinePx(viewport) + 1
    const viewportBottom = viewportRect.bottom

    const firstVisibleRow = rows.find((row) => isVisibleConversationRow(row, viewportTop, viewportBottom))
    return firstVisibleRow?.dataset.conversationId ?? rows[0]?.dataset.conversationId ?? null
}

export function resolveTranscriptRowByIndex(options: {
    rowIndex: number
    viewport: HTMLDivElement | null
}): HTMLElement | null {
    const { rowIndex, viewport } = options
    if (!viewport) {
        return null
    }

    const rows = [...viewport.querySelectorAll<HTMLElement>(TRANSCRIPT_ROW_SELECTOR)]
    return rows.find((row) => Number.parseInt(row.dataset.rowIndex ?? '', 10) === rowIndex) ?? null
}

export function resolveTranscriptRowByConversationId(options: {
    conversationId: string
    viewport: HTMLDivElement | null
}): HTMLElement | null {
    const { conversationId, viewport } = options
    if (!viewport) {
        return null
    }

    const rows = [...viewport.querySelectorAll<HTMLElement>(TRANSCRIPT_ROW_SELECTOR)]
    return rows.find((row) => row.dataset.conversationId === conversationId) ?? null
}

export function resolveTranscriptHistoryJumpTargetRowByConversationId(options: {
    conversationId: string
    viewport: HTMLDivElement | null
}): HTMLElement | null {
    const { conversationId, viewport } = options
    if (!viewport) {
        return null
    }

    const rows = [
        ...viewport.querySelectorAll<HTMLElement>(`${TRANSCRIPT_ROW_SELECTOR}[data-history-jump-target="true"]`),
    ]
    return rows.find((row) => row.dataset.conversationId === conversationId) ?? null
}
