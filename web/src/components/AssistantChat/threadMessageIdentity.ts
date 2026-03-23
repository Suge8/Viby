import type { ChatBlock, NormalizedMessage } from '@/chat/types'
import { isCliOutputText } from '@/chat/reducerCliOutput'

export const THREAD_MESSAGE_ID_ATTRIBUTE = 'data-viby-thread-message-id'

export function getThreadMessageId(block: ChatBlock): string {
    switch (block.kind) {
        case 'user-text':
            return `user:${block.id}`
        case 'agent-text':
        case 'agent-reasoning':
            return `assistant:${block.id}`
        case 'agent-event':
            return `event:${block.id}`
        case 'cli-output':
            return `cli:${block.id}`
        case 'tool-call':
            return `tool:${block.id}`
    }
}

function collectThreadMessageIdsInto(target: string[], block: ChatBlock): void {
    target.push(getThreadMessageId(block))

    if (block.kind === 'tool-call') {
        for (const child of block.children) {
            collectThreadMessageIdsInto(target, child)
        }
    }
}

export function collectThreadMessageIds(blocks: readonly ChatBlock[]): string[] {
    const ids: string[] = []
    for (const block of blocks) {
        collectThreadMessageIdsInto(ids, block)
    }
    return ids
}

function collectThreadMessageOwnerByIdInto(
    target: Map<string, string>,
    block: ChatBlock,
    ownerId: string
): void {
    target.set(getThreadMessageId(block), ownerId)

    if (block.kind === 'tool-call') {
        for (const child of block.children) {
            collectThreadMessageOwnerByIdInto(target, child, ownerId)
        }
    }
}

export function collectThreadMessageOwnerById(blocks: readonly ChatBlock[]): ReadonlyMap<string, string> {
    const ownerById = new Map<string, string>()

    for (const block of blocks) {
        const ownerId = getThreadMessageId(block)
        collectThreadMessageOwnerByIdInto(ownerById, block, ownerId)
    }

    return ownerById
}

export function isThreadHistoryJumpTarget(message: NormalizedMessage): boolean {
    return message.role === 'user' && !isCliOutputText(message.content.text, message.meta)
}
