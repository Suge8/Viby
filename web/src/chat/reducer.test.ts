import { describe, expect, it } from 'vitest'
import { reduceChatBlocks } from '@/chat/reducer'
import type { NormalizedMessage } from '@/chat/types'

describe('reduceChatBlocks', () => {
    it('assigns renderMode in the reducer so views do not need to guess', () => {
        const normalized: NormalizedMessage[] = [
            {
                id: 'user-1',
                localId: null,
                createdAt: 1_000,
                role: 'user',
                isSidechain: false,
                content: { type: 'text', text: '# user heading' },
            },
            {
                id: 'agent-1',
                localId: null,
                createdAt: 2_000,
                role: 'agent',
                isSidechain: false,
                content: [{ type: 'text', text: '# assistant heading', uuid: 'u1', parentUUID: null }],
            },
        ]

        const result = reduceChatBlocks(normalized, null)

        expect(result.blocks).toMatchObject([
            {
                kind: 'user-text',
                text: '# user heading',
                renderMode: 'plain',
            },
            {
                kind: 'agent-text',
                text: '# assistant heading',
                renderMode: 'markdown',
            },
        ])
    })
})
