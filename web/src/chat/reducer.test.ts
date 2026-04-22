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

    it('suppresses duplicated Task prompts and sidechain prompt echoes from chat blocks', () => {
        const normalized: NormalizedMessage[] = [
            {
                id: 'assistant-task',
                localId: null,
                createdAt: 1_000,
                role: 'agent',
                isSidechain: false,
                content: [
                    { type: 'text', text: 'Investigate the regression', uuid: 'task-root', parentUUID: null },
                    {
                        type: 'tool-call',
                        id: 'tool-task',
                        name: 'Task',
                        input: { prompt: 'Investigate the regression' },
                        description: null,
                        uuid: 'task-root',
                        parentUUID: null,
                    },
                ],
            },
            {
                id: 'assistant-sidechain',
                localId: null,
                createdAt: 1_100,
                role: 'agent',
                isSidechain: true,
                content: [{ type: 'sidechain', uuid: 'sidechain-root', prompt: 'Investigate the regression' }],
            },
        ]

        const result = reduceChatBlocks(normalized, null)

        expect(result.blocks).toHaveLength(1)
        expect(result.blocks[0]).toMatchObject({
            kind: 'tool-call',
            tool: {
                id: 'tool-task',
                name: 'Task',
            },
        })
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
                },
            },
        }

        const result = reduceChatBlocks(normalized, agentState)

        expect(result.blocks.map((block) => `${block.kind}:${block.createdAt}`)).toEqual([
            'user-text:1000',
            'tool-call:1500',
            'agent-text:2000',
            'agent-text:4000',
        ])
    })

    it('renders normalized plan updates as completed update_plan tool cards', () => {
        const normalized: NormalizedMessage[] = [
            {
                id: 'agent-plan',
                localId: null,
                createdAt: 1_000,
                role: 'agent',
                isSidechain: false,
                content: [
                    {
                        type: 'tool-call',
                        id: 'plan:turn-1',
                        name: 'update_plan',
                        input: {
                            plan: [
                                { step: 'Research existing flow', status: 'completed' },
                                { step: 'Render plan updates', status: 'in_progress' },
                            ],
                        },
                        description: null,
                        uuid: 'plan:turn-1',
                        parentUUID: null,
                    },
                    {
                        type: 'tool-result',
                        tool_use_id: 'plan:turn-1',
                        content: {
                            plan: [
                                { step: 'Research existing flow', status: 'completed' },
                                { step: 'Render plan updates', status: 'in_progress' },
                            ],
                        },
                        is_error: false,
                        uuid: 'plan:turn-1:result',
                        parentUUID: 'plan:turn-1',
                    },
                ],
            },
        ]

        const result = reduceChatBlocks(normalized, null)

        expect(result.blocks).toMatchObject([
            {
                kind: 'tool-call',
                tool: {
                    id: 'plan:turn-1',
                    name: 'update_plan',
                    state: 'completed',
                    input: {
                        plan: [
                            { step: 'Research existing flow', status: 'completed' },
                            { step: 'Render plan updates', status: 'in_progress' },
                        ],
                    },
                },
            },
        ])
    })

    it('drops legacy change_title tool transcript artifacts', () => {
        const normalized: NormalizedMessage[] = [
            {
                id: 'agent-title-call',
                localId: null,
                createdAt: 1_000,
                role: 'agent',
                isSidechain: false,
                content: [
                    {
                        type: 'tool-call',
                        id: 'legacy-title-tool',
                        name: 'viby__change_title',
                        input: { title: 'Legacy title' },
                        description: null,
                        uuid: 'legacy-title-tool',
                        parentUUID: null,
                    },
                    {
                        type: 'tool-result',
                        tool_use_id: 'legacy-title-tool',
                        content: { ok: true },
                        is_error: false,
                        uuid: 'legacy-title-tool:result',
                        parentUUID: 'legacy-title-tool',
                    },
                ],
            },
        ]

        const result = reduceChatBlocks(normalized, null)

        expect(result.blocks).toEqual([])
    })
})
