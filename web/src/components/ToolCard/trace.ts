import { safeStringify } from '@viby/protocol/utils'
import type { ChatBlock, ToolCallBlock } from '@/chat/types'

export type ToolTraceItem = {
    id: string
    label: string
    detail: string
    depth: number
    state?: ToolCallBlock['tool']['state']
}

const TRACE_DETAIL_MAX_LENGTH = 180

function truncateDetail(value: string): string {
    const compact = value.replace(/\s+/g, ' ').trim()
    if (compact.length <= TRACE_DETAIL_MAX_LENGTH) {
        return compact
    }

    return `${compact.slice(0, TRACE_DETAIL_MAX_LENGTH - 1).trimEnd()}…`
}

function getBlockTraceItem(block: ChatBlock, depth: number): ToolTraceItem | null {
    if (block.kind === 'tool-call') {
        return {
            id: block.id,
            label: block.tool.name,
            detail: truncateDetail(block.tool.description ?? safeStringify(block.tool.input)),
            depth,
            state: block.tool.state,
        }
    }
    if (block.kind === 'user-text') {
        return {
            id: block.id,
            label: 'User',
            detail: truncateDetail(block.text),
            depth,
        }
    }
    if (block.kind === 'agent-text') {
        return {
            id: block.id,
            label: 'Assistant',
            detail: truncateDetail(block.text),
            depth,
        }
    }
    if (block.kind === 'agent-reasoning') {
        return {
            id: block.id,
            label: 'Reasoning',
            detail: truncateDetail(block.text),
            depth,
        }
    }
    if (block.kind === 'command-output') {
        return {
            id: block.id,
            label: 'Output',
            detail: truncateDetail(block.text),
            depth,
        }
    }

    return {
        id: block.id,
        label: 'Event',
        detail: truncateDetail(safeStringify(block.event)),
        depth,
    }
}

function collectTraceItems(blocks: readonly ChatBlock[], depth: number, items: ToolTraceItem[]): void {
    for (const block of blocks) {
        const item = getBlockTraceItem(block, depth)
        if (item && item.detail.length > 0) {
            items.push(item)
        }
        if (block.kind === 'tool-call' && block.children.length > 0) {
            collectTraceItems(block.children, depth + 1, items)
        }
    }
}

export function buildToolTraceItems(block: ToolCallBlock): ToolTraceItem[] {
    const items: ToolTraceItem[] = []
    collectTraceItems(block.children, 0, items)
    return items
}
