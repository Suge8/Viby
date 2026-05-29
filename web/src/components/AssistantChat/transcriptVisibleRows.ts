import { TRANSCRIPT_ROW_SELECTOR } from '@/lib/sessionUiContracts'

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
