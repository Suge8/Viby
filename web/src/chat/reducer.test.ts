import { describe, expect, it } from 'vitest'
import { reduceChatBlocks } from '@/chat/reducer'
import type { NormalizedMessage } from '@/chat/types'
import type { AgentState } from '@/types/api'

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

    it('keeps permission-only tool cards in chronological order instead of pinning them to the thread bottom', () => {
        const normalized: NormalizedMessage[] = [
            {
                id: 'user-1',
                localId: null,
                createdAt: 1_000,
                role: 'user',
                isSidechain: false,
                content: { type: 'text', text: 'first prompt' },
            },
            {
                id: 'assistant-1',
                localId: null,
                createdAt: 2_000,
                role: 'agent',
                isSidechain: false,
                content: [{ type: 'text', text: 'working on it', uuid: 'a1', parentUUID: null }],
            },
            {
                id: 'assistant-2',
                localId: null,
                createdAt: 4_000,
                role: 'agent',
                isSidechain: false,
                content: [{ type: 'text', text: 'final answer', uuid: 'a2', parentUUID: null }],
            },
        ]
        const agentState: AgentState = {
            requests: {},
            completedRequests: {
                'tool-read-1': {
                    tool: 'Read',
                    arguments: { file: 'README.md' },
                    status: 'approved',
                    createdAt: 1_500,
                    completedAt: 1_800,
                }
            }
        }

        const result = reduceChatBlocks(normalized, agentState)

        expect(result.blocks.map((block) => `${block.kind}:${block.createdAt}`)).toEqual([
            'user-text:1000',
            'tool-call:1500',
            'agent-text:2000',
            'agent-text:4000',
        ])
    })
})
