import { describe, expect, it } from 'vitest'
import type { ChatBlock, ToolCallBlock } from '@/chat/types'
import { ensureToolBlock } from '@/chat/reducerTools'

function createAgentTextBlock(id: string, createdAt: number): ChatBlock {
    return {
        kind: 'agent-text',
        id,
        localId: null,
        createdAt,
        text: id,
        renderMode: 'plain'
    }
}

function createToolBlock(blocks: ChatBlock[], toolBlocksById: Map<string, ToolCallBlock>, createdAt: number): ToolCallBlock {
    return ensureToolBlock(blocks, toolBlocksById, 'tool-1', {
        createdAt,
        localId: null,
        name: 'Read',
        input: { file: 'README.md' },
        description: null,
    })
}

describe('ensureToolBlock', () => {
    it('inserts new tool blocks by createdAt instead of appending them to the end', () => {
        const blocks: ChatBlock[] = [
            createAgentTextBlock('agent-1', 2_000),
            createAgentTextBlock('agent-2', 4_000)
        ]
        const toolBlocksById = new Map<string, ToolCallBlock>()

        createToolBlock(blocks, toolBlocksById, 1_500)

        expect(blocks.map((block) => `${block.kind}:${block.createdAt}`)).toEqual([
            'tool-call:1500',
            'agent-text:2000',
            'agent-text:4000'
        ])
    })

    it('moves existing tool blocks when a later pass discovers an earlier createdAt', () => {
        const blocks: ChatBlock[] = [
            createAgentTextBlock('agent-1', 2_000),
            createAgentTextBlock('agent-2', 4_000)
        ]
        const toolBlocksById = new Map<string, ToolCallBlock>()

        const block = createToolBlock(blocks, toolBlocksById, 4_500)
        const sameBlock = createToolBlock(blocks, toolBlocksById, 1_500)

        expect(sameBlock).toBe(block)
        expect(blocks.map((entry) => `${entry.kind}:${entry.createdAt}`)).toEqual([
            'tool-call:1500',
            'agent-text:2000',
            'agent-text:4000'
        ])
    })
})
