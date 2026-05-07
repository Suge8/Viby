import { describe, expect, it } from 'vitest'
import { buildConversationOutline } from '@/chat/outline'
import type { TranscriptRow } from '@/chat/transcriptTypes'

function userRow(id: string, text: string, depth: number = 0): TranscriptRow {
    return {
        id: `user:${id}`,
        type: 'user',
        tone: 'user',
        conversationId: `conversation:${id}`,
        depth,
        copyText: text,
        block: {
            kind: 'user-text',
            id,
            localId: null,
            createdAt: 1_000,
            text,
            renderMode: 'plain',
        },
    }
}

describe('buildConversationOutline', () => {
    it('indexes only top-level user turns with compact titles', () => {
        const outline = buildConversationOutline([
            userRow('one', 'First request\nwith detail'),
            userRow('nested', 'Nested side task', 1),
            {
                id: 'assistant:one',
                type: 'assistant-text',
                conversationId: 'assistant:one',
                depth: 0,
                copyText: 'Done',
                block: {
                    kind: 'agent-text',
                    id: 'assistant-one',
                    localId: null,
                    createdAt: 1_100,
                    text: 'Done',
                    renderMode: 'plain',
                },
            },
            userRow('two', 'Second request'),
        ])

        expect(outline).toEqual([
            {
                conversationId: 'conversation:one',
                title: 'First request with detail',
                createdAt: 1_000,
            },
            {
                conversationId: 'conversation:two',
                title: 'Second request',
                createdAt: 1_000,
            },
        ])
    })
})
