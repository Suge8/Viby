import { describe, expect, it } from 'vitest'
import { reconcileChatBlocks } from '@/chat/reconcile'
import type { AgentTextBlock, ChatBlock } from '@/chat/types'

function createAgentTextBlock(renderMode: 'plain' | 'markdown'): AgentTextBlock {
    return {
        kind: 'agent-text',
        id: 'agent-1',
        localId: null,
        createdAt: 1_000,
        text: '# heading',
        renderMode,
    }
}

describe('reconcileChatBlocks', () => {
    it('reuses agent text blocks when the render contract is unchanged', () => {
        const previousBlock = createAgentTextBlock('markdown')
        const previousById = new Map<string, ChatBlock>([[previousBlock.id, previousBlock]])

        const result = reconcileChatBlocks([createAgentTextBlock('markdown')], previousById)

        expect(result.blocks[0]).toBe(previousBlock)
    })

    it('replaces agent text blocks when renderMode changes', () => {
        const previousBlock = createAgentTextBlock('plain')
        const previousById = new Map<string, ChatBlock>([[previousBlock.id, previousBlock]])

        const result = reconcileChatBlocks([createAgentTextBlock('markdown')], previousById)

        expect(result.blocks[0]).not.toBe(previousBlock)
        expect(result.blocks[0]).toMatchObject({ renderMode: 'markdown' })
    })
})
