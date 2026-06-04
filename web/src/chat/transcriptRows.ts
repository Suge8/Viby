import { buildTranscriptRenderRows } from '@/chat/transcriptRenderRows'
import {
    getTranscriptRowId,
    TRANSCRIPT_REASONING_GROUP_PREFIX,
    type TranscriptModel,
    type TranscriptRow,
    type TranscriptSentFrom,
} from '@/chat/transcriptTypes'
import type { AgentReasoningBlock, ChatBlock, UserTextBlock } from '@/chat/types'

function getSentFrom(meta: unknown): TranscriptSentFrom | null {
    if (!meta || typeof meta !== 'object') {
        return null
    }

    const sentFrom = (meta as Record<string, unknown>).sentFrom
    switch (sentFrom) {
        case 'runtime':
        case 'webapp':
        case 'user':
            return sentFrom
        default:
            return null
    }
}

function getCopyText(text: string): string | null {
    const normalized = text.trim()
    return normalized.length > 0 ? normalized : null
}

function collectReasoningGroup(options: { blocks: readonly ChatBlock[]; startIndex: number }): {
    blocks: AgentReasoningBlock[]
    nextIndex: number
} {
    const group: AgentReasoningBlock[] = [options.blocks[options.startIndex] as AgentReasoningBlock]
    let nextIndex = options.startIndex + 1

    while (nextIndex < options.blocks.length) {
        const next = options.blocks[nextIndex]
        if (!next || next.kind !== 'agent-reasoning') {
            break
        }
        group.push(next)
        nextIndex += 1
    }

    return {
        blocks: group,
        nextIndex,
    }
}

function pushReasoningRow(options: {
    rows: TranscriptRow[]
    blocks: readonly AgentReasoningBlock[]
    conversationId: string
    depth: number
}): void {
    const text = options.blocks
        .map((block) => block.text.trim())
        .filter((part) => part.length > 0)
        .join('\n\n')
        .trim()

    options.rows.push({
        id: `${TRANSCRIPT_REASONING_GROUP_PREFIX}${options.blocks[0]!.id}`,
        type: 'assistant-reasoning',
        conversationId: options.conversationId,
        depth: options.depth,
        blocks: options.blocks,
        text,
        renderMode: 'markdown',
        copyText: null,
    })
}

function pushUserRow(options: {
    rows: TranscriptRow[]
    block: UserTextBlock
    conversationId: string
    depth: number
}): void {
    options.rows.push({
        id: getTranscriptRowId(options.block),
        type: 'user',
        block: options.block,
        tone: 'user',
        conversationId: options.conversationId,
        depth: options.depth,
        copyText: getCopyText(options.block.text),
    })
}

function pushBlockRows(options: {
    rows: TranscriptRow[]
    blocks: readonly ChatBlock[]
    conversationId: string
    depth: number
}): void {
    let index = 0

    while (index < options.blocks.length) {
        const block = options.blocks[index]!

        if (block.kind === 'agent-reasoning') {
            const group = collectReasoningGroup({
                blocks: options.blocks,
                startIndex: index,
            })
            pushReasoningRow({
                rows: options.rows,
                blocks: group.blocks,
                conversationId: options.conversationId,
                depth: options.depth,
            })
            index = group.nextIndex
            continue
        }

        const rowId = getTranscriptRowId(block)

        if (block.kind === 'user-text') {
            pushUserRow({
                rows: options.rows,
                block,
                conversationId: options.conversationId,
                depth: options.depth,
            })
        } else if (block.kind === 'agent-text') {
            options.rows.push({
                id: rowId,
                type: 'assistant-text',
                block,
                conversationId: options.conversationId,
                depth: options.depth,
                copyText: getCopyText(block.text),
            })
        } else if (block.kind === 'tool-call') {
            options.rows.push({
                id: rowId,
                type: 'tool',
                block,
                conversationId: options.conversationId,
                depth: options.depth,
                copyText: null,
            })
            pushBlockRows({
                rows: options.rows,
                blocks: block.children,
                conversationId: options.conversationId,
                depth: options.depth + 1,
            })
        } else if (block.kind === 'command-output') {
            options.rows.push({
                id: rowId,
                type: 'command-output',
                block,
                conversationId: options.conversationId,
                depth: options.depth,
                copyText: null,
            })
        } else if (block.kind === 'agent-event') {
            options.rows.push({
                id: rowId,
                type: 'event',
                block,
                conversationId: options.conversationId,
                depth: options.depth,
                copyText: null,
            })
        }

        index += 1
    }
}

function arraysShareIdentity<T>(a: readonly T[], b: readonly T[]): boolean {
    if (a === b) {
        return true
    }
    if (a.length !== b.length) {
        return false
    }
    for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) {
            return false
        }
    }
    return true
}

function areTranscriptRowsEquivalent(previous: TranscriptRow, next: TranscriptRow): boolean {
    if (
        previous.type !== next.type ||
        previous.id !== next.id ||
        previous.conversationId !== next.conversationId ||
        previous.depth !== next.depth ||
        previous.copyText !== next.copyText
    ) {
        return false
    }

    switch (next.type) {
        case 'user':
        case 'assistant-text':
        case 'tool':
        case 'command-output':
        case 'event':
            return (previous as typeof next).block === next.block
        case 'assistant-reasoning':
            return (
                (previous as typeof next).text === next.text &&
                (previous as typeof next).renderMode === next.renderMode &&
                arraysShareIdentity((previous as typeof next).blocks, next.blocks)
            )
        case 'assistant-thinking':
            return (previous as typeof next).phase === next.phase
    }
}

export function stabilizeTranscriptRowIdentities(
    rows: readonly TranscriptRow[],
    cache: Map<string, TranscriptRow>
): TranscriptRow[] {
    let changed = false
    const stabilized: TranscriptRow[] = rows.map((row) => {
        const cached = cache.get(row.id)
        if (cached && areTranscriptRowsEquivalent(cached, row)) {
            if (cached !== row) {
                changed = true
            }
            return cached
        }
        return row
    })

    cache.clear()
    for (const row of stabilized) {
        cache.set(row.id, row)
    }

    if (!changed) {
        return stabilized
    }
    return stabilized
}

export function createTranscriptModel(blocks: readonly ChatBlock[]): TranscriptModel {
    const rows: TranscriptRow[] = []
    const conversationIds: string[] = []
    const rowStartIndexByConversationId = new Map<string, number>()

    let index = 0
    while (index < blocks.length) {
        const block = blocks[index]!

        if (block.kind === 'agent-reasoning') {
            const group = collectReasoningGroup({
                blocks,
                startIndex: index,
            })
            const conversationId = `${TRANSCRIPT_REASONING_GROUP_PREFIX}${group.blocks[0]!.id}`
            conversationIds.push(conversationId)
            rowStartIndexByConversationId.set(conversationId, rows.length)
            pushReasoningRow({
                rows,
                blocks: group.blocks,
                conversationId,
                depth: 0,
            })
            index = group.nextIndex
            continue
        }

        const conversationId = getTranscriptRowId(block)
        conversationIds.push(conversationId)
        rowStartIndexByConversationId.set(conversationId, rows.length)

        pushBlockRows({
            rows,
            blocks: [block],
            conversationId,
            depth: 0,
        })
        index += 1
    }

    return {
        rows,
        renderRows: buildTranscriptRenderRows(rows),
        conversationIds,
        rowStartIndexByConversationId,
    }
}
