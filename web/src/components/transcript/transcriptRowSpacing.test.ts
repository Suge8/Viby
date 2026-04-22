import { describe, expect, it } from 'vitest'
import { buildTranscriptRenderRows, resolveTranscriptRowGap } from '@/chat/transcriptRenderRows'
import type {
    TranscriptAssistantTextRow,
    TranscriptEventRow,
    TranscriptReasoningRow,
    TranscriptToolRow,
    TranscriptUserRow,
} from '@/chat/transcriptTypes'

function createAssistantTextRow(): TranscriptAssistantTextRow {
    return {
        id: 'assistant:1',
        type: 'assistant-text',
        conversationId: 'assistant:1',
        depth: 0,
        copyText: 'assistant',
        block: {
            kind: 'agent-text',
            id: 'assistant-1',
            localId: null,
            createdAt: 1,
            text: 'assistant',
            renderMode: 'plain',
        },
    }
}

function createReasoningRow(): TranscriptReasoningRow {
    return {
        id: 'reasoning:1',
        type: 'assistant-reasoning',
        conversationId: 'reasoning:1',
        depth: 0,
        copyText: null,
        blocks: [],
        text: 'reasoning',
        renderMode: 'markdown',
    }
}

function createToolRow(): TranscriptToolRow {
    return {
        id: 'tool:1',
        type: 'tool',
        conversationId: 'tool:1',
        depth: 0,
        copyText: null,
        block: {
            kind: 'tool-call',
            id: 'tool-1',
            localId: null,
            createdAt: 1,
            children: [],
            tool: {
                id: 'tool-1',
                name: 'Terminal',
                state: 'completed',
                input: null,
                createdAt: 1,
                startedAt: 1,
                completedAt: 2,
                description: null,
                result: null,
            },
        },
    }
}

function createUserRow(): TranscriptUserRow {
    return {
        id: 'user:1',
        type: 'user',
        conversationId: 'user:1',
        depth: 0,
        copyText: 'user',
        tone: 'user',
        block: {
            kind: 'user-text',
            id: 'user-1',
            localId: null,
            createdAt: 1,
            text: 'user',
            renderMode: 'plain',
        },
    }
}

function createEventRow(): TranscriptEventRow {
    return {
        id: 'event:1',
        type: 'event',
        conversationId: 'event:1',
        depth: 0,
        copyText: null,
        block: {
            kind: 'agent-event',
            id: 'event-1',
            createdAt: 1,
            event: { type: 'message', message: 'event' },
        },
    }
}

describe('transcriptRowSpacing', () => {
    it('keeps assistant-internal rows compact', () => {
        expect(resolveTranscriptRowGap(createToolRow(), createAssistantTextRow())).toBe('compact')
        expect(resolveTranscriptRowGap(createReasoningRow(), createToolRow())).toBe('compact')
    })

    it('uses standard spacing across turn boundaries', () => {
        expect(resolveTranscriptRowGap(createUserRow(), createAssistantTextRow())).toBe('base')
        expect(resolveTranscriptRowGap(createAssistantTextRow(), createUserRow())).toBe('base')
    })

    it('uses loose spacing around notices and events', () => {
        expect(resolveTranscriptRowGap(createEventRow(), createAssistantTextRow())).toBe('loose')
        expect(resolveTranscriptRowGap(createAssistantTextRow(), createEventRow())).toBe('loose')
    })

    it('marks the final row with no trailing gap', () => {
        expect(buildTranscriptRenderRows([createAssistantTextRow()])[0]?.gap).toBe('none')
    })
})
