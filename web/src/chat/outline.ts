import type { TranscriptRow } from '@/chat/transcriptTypes'

export type ConversationOutlineItem = {
    conversationId: string
    title: string
    createdAt: number
}

const OUTLINE_TITLE_MAX_LENGTH = 80

function compactText(text: string): string {
    return text.replace(/\s+/g, ' ').trim()
}

function truncateTitle(title: string): string {
    if (title.length <= OUTLINE_TITLE_MAX_LENGTH) {
        return title
    }

    return `${title.slice(0, OUTLINE_TITLE_MAX_LENGTH - 1).trimEnd()}…`
}

function getUserRowTitle(row: Extract<TranscriptRow, { type: 'user' }>): string {
    const text = compactText(row.block.text)
    if (text.length > 0) {
        return truncateTitle(text)
    }

    const attachments = row.block.attachments ?? []
    const attachmentTitle = compactText(attachments.map((attachment) => attachment.filename).join(', '))
    return attachmentTitle.length > 0 ? truncateTitle(attachmentTitle) : 'Untitled'
}

export function buildConversationOutline(rows: readonly TranscriptRow[]): ConversationOutlineItem[] {
    const items: ConversationOutlineItem[] = []

    for (const row of rows) {
        if (row.type !== 'user' || row.depth !== 0) {
            continue
        }
        items.push({
            conversationId: row.conversationId,
            title: getUserRowTitle(row),
            createdAt: row.block.createdAt,
        })
    }

    return items
}
