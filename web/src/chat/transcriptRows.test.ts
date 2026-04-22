import { describe, expect, it } from 'vitest'
import { createTranscriptModel } from '@/chat/transcriptRows'
import type { ChatBlock } from '@/chat/types'

describe('createTranscriptModel', () => {
    it('flattens nested tool children while preserving the top-level conversation owner', () => {
        const blocks: ChatBlock[] = [
            {
                kind: 'tool-call',
                id: 'tool-1',
                localId: null,
                createdAt: 1,
                tool: {
                    id: 'tool-1',
                    name: 'Task',
                    state: 'running',
                    input: {},
                    createdAt: 1,
                    startedAt: 1,
                    completedAt: null,
                    description: null,
                },
                children: [
                    {
                        kind: 'user-text',
                        id: 'child-1',
                        localId: null,
                        createdAt: 2,
                        text: 'fix failing test',
                        renderMode: 'plain',
                    },
                ],
            },
        ]

        const model = createTranscriptModel(blocks)

        expect(model.rows).toHaveLength(2)
        expect(model.rows[0]).toMatchObject({
            id: 'tool:tool-1',
            conversationId: 'tool:tool-1',
            depth: 0,
            type: 'tool',
        })
        expect(model.rows[1]).toMatchObject({
            id: 'user:child-1',
            conversationId: 'tool:tool-1',
            depth: 1,
            type: 'user',
        })
    })

    it('keeps user messages available as history jump targets', () => {
        const model = createTranscriptModel([
            {
                kind: 'user-text',
                id: 'user-1',
                localId: null,
                createdAt: 1,
                text: 'continue the task',
                renderMode: 'plain',
            },
        ])

        expect(model.rows[0]).toMatchObject({
            id: 'user:user-1',
            type: 'user',
            copyText: 'continue the task',
        })
        expect(model.historyJumpTargetConversationIds).toEqual(['user:user-1'])
    })

    it('groups consecutive reasoning blocks into one collapsible row', () => {
        const model = createTranscriptModel([
            {
                kind: 'agent-reasoning',
                id: 'reason-1',
                localId: null,
                createdAt: 1,
                text: 'step 1',
            },
            {
                kind: 'agent-reasoning',
                id: 'reason-2',
                localId: null,
                createdAt: 2,
                text: 'step 2',
            },
        ])

        expect(model.rows).toHaveLength(1)
        expect(model.rows[0]).toMatchObject({
            id: 'reasoning-group:reason-1',
            type: 'assistant-reasoning',
            text: 'step 1\n\nstep 2',
        })
    })
})
