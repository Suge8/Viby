import { describe, expect, it } from 'vitest'
import { normalizeDecryptedMessage } from './normalize'
import { normalizeAgentRecord } from './normalizeAgent'

describe('normalizeAgentRecord', () => {
    it('drops assistant output records that do not contain any visible content blocks', () => {
        const normalized = normalizeAgentRecord('assistant-1', null, 1_000, {
            type: 'output',
            data: {
                type: 'assistant',
                message: {
                    content: [
                        { type: 'text', text: '   ' },
                        { type: 'thinking', thinking: '\n\t' },
                    ],
                },
            },
        })

        expect(normalized).toBeNull()
    })

    it('keeps assistant output records that still contain a visible text block', () => {
        const normalized = normalizeAgentRecord('assistant-1', null, 1_000, {
            type: 'output',
            data: {
                type: 'assistant',
                message: {
                    content: [
                        { type: 'text', text: '   ' },
                        { type: 'thinking', thinking: '\n\t' },
                        { type: 'text', text: 'hello' },
                    ],
                },
            },
        })

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [{ type: 'text', text: 'hello' }],
        })
    })

    it('projects proposed_plan blocks inside assistant text into native proposed_plan tool cards', () => {
        const normalized = normalizeAgentRecord('assistant-plan', null, 1_000, {
            type: 'output',
            data: {
                type: 'assistant',
                message: {
                    content: [
                        {
                            type: 'text',
                            text: [
                                'Before',
                                '<proposed_plan>',
                                '# Proposed Plan',
                                '',
                                '- Step 1',
                                '</proposed_plan>',
                                'After',
                            ].join('\n'),
                        },
                    ],
                },
            },
        })

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [
                { type: 'text', text: 'Before\n' },
                {
                    type: 'tool-call',
                    name: 'proposed_plan',
                    input: {
                        plan: '# Proposed Plan\n\n- Step 1',
                    },
                },
                {
                    type: 'tool-result',
                    content: {
                        plan: '# Proposed Plan\n\n- Step 1',
                    },
                    is_error: false,
                },
                { type: 'text', text: '\nAfter' },
            ],
        })
    })

    it('keeps synthetic proposed_plan ids stable across multiple assistant text blocks in one message', () => {
        const normalized = normalizeAgentRecord('assistant-multi-plan', null, 1_000, {
            type: 'output',
            data: {
                type: 'assistant',
                uuid: 'assistant-multi-plan',
                message: {
                    content: [
                        {
                            type: 'text',
                            text: ['<proposed_plan>', '# Plan A', '</proposed_plan>'].join('\n'),
                        },
                        {
                            type: 'text',
                            text: ['<proposed_plan>', '# Plan B', '</proposed_plan>'].join('\n'),
                        },
                    ],
                },
            },
        })

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [
                {
                    type: 'tool-call',
                    id: 'assistant-multi-plan:proposed-plan:0',
                    name: 'proposed_plan',
                },
                {
                    type: 'tool-result',
                    tool_use_id: 'assistant-multi-plan:proposed-plan:0',
                },
                {
                    type: 'tool-call',
                    id: 'assistant-multi-plan:proposed-plan:1',
                    name: 'proposed_plan',
                },
                {
                    type: 'tool-result',
                    tool_use_id: 'assistant-multi-plan:proposed-plan:1',
                },
            ],
        })
    })

    it('normalizes Pi assistant output records that use toolCall blocks and Pi usage keys', () => {
        const normalized = normalizeAgentRecord('assistant-pi', null, 1_000, {
            type: 'output',
            data: {
                type: 'assistant',
                uuid: 'pi-1',
                message: {
                    content: [
                        { type: 'toolCall', id: 'tool-1', name: 'read_file', arguments: { path: 'README.md' } },
                        { type: 'text', text: 'done' },
                    ],
                    usage: {
                        input: 12,
                        output: 34,
                    },
                },
            },
        })

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [
                { type: 'tool-call', id: 'tool-1', name: 'read_file', input: { path: 'README.md' } },
                { type: 'text', text: 'done' },
            ],
            usage: {
                input_tokens: 12,
                output_tokens: 34,
            },
        })
    })

    it('normalizes legacy Pi assistant records stored under the codex wrapper', () => {
        const normalized = normalizeAgentRecord('assistant-pi-legacy', null, 1_000, {
            type: 'codex',
            data: {
                type: 'assistant',
                uuid: 'pi-legacy',
                message: {
                    content: [{ type: 'text', text: 'legacy pi reply' }],
                    usage: {
                        input: 1,
                        output: 2,
                    },
                },
            },
        })

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [{ type: 'text', text: 'legacy pi reply' }],
            usage: {
                input_tokens: 1,
                output_tokens: 2,
            },
        })
    })

    it('drops system-injected pseudo-user messages from Claude transcripts', () => {
        const normalized = normalizeAgentRecord('system-user-1', null, 1_000, {
            type: 'output',
            data: {
                type: 'user',
                message: {
                    content: '<system-reminder>internal only</system-reminder>',
                },
            },
        })

        expect(normalized).toBeNull()
    })

    it('drops hidden auto-title summary output records from transcript normalization', () => {
        const normalized = normalizeAgentRecord('summary-1', null, 1_000, {
            type: 'output',
            data: {
                type: 'summary',
                summary: 'Recovered title',
                isMeta: true,
            },
        })

        expect(normalized).toBeNull()
    })

    it('keeps legacy Pi codex transcript visible through full message normalization', () => {
        const normalized = normalizeDecryptedMessage({
            id: 'message-pi-legacy',
            seq: 1,
            localId: null,
            createdAt: 1_000,
            content: {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'assistant',
                        message: {
                            content: [{ type: 'text', text: 'reply from legacy pi transcript' }],
                            usage: {
                                input: 3,
                                output: 5,
                            },
                        },
                    },
                },
            },
        })

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [{ type: 'text', text: 'reply from legacy pi transcript' }],
            usage: {
                input_tokens: 3,
                output_tokens: 5,
            },
        })
    })

    it('drops durable data-url attachment previews from user messages', () => {
        const normalized = normalizeDecryptedMessage({
            id: 'message-user-attachment',
            seq: 1,
            localId: null,
            createdAt: 1_000,
            content: {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'see image',
                    attachments: [
                        {
                            id: 'attachment-1',
                            filename: 'photo.png',
                            mimeType: 'image/png',
                            size: 123,
                            path: '/tmp/photo.png',
                            previewUrl: 'data:image/png;base64,abc',
                        },
                    ],
                },
            },
        })

        expect(normalized).toMatchObject({
            role: 'user',
            content: {
                type: 'text',
                text: 'see image',
                attachments: [
                    {
                        id: 'attachment-1',
                        filename: 'photo.png',
                        mimeType: 'image/png',
                        size: 123,
                        path: '/tmp/photo.png',
                    },
                ],
            },
        })
    })

    it('normalizes codex plan updates into completed update_plan tool blocks', () => {
        const normalized = normalizeDecryptedMessage({
            id: 'message-plan',
            seq: 1,
            localId: null,
            createdAt: 1_000,
            content: {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'plan',
                        id: 'plan:turn-1',
                        explanation: 'Show the current rollout clearly',
                        entries: [
                            { content: 'Trace current transcript owner', status: 'completed' },
                            { content: 'Render plan updates in web', status: 'in_progress' },
                        ],
                    },
                },
            },
        })

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [
                {
                    type: 'tool-call',
                    id: 'plan:turn-1',
                    name: 'update_plan',
                    input: {
                        explanation: 'Show the current rollout clearly',
                        plan: [
                            { step: 'Trace current transcript owner', status: 'completed' },
                            { step: 'Render plan updates in web', status: 'in_progress' },
                        ],
                    },
                },
                {
                    type: 'tool-result',
                    tool_use_id: 'plan:turn-1',
                    content: {
                        explanation: 'Show the current rollout clearly',
                    },
                    is_error: false,
                },
            ],
        })
    })

    it('normalizes codex assistant messages with proposed_plan blocks into native proposed_plan tool cards', () => {
        const normalized = normalizeDecryptedMessage({
            id: 'message-proposed-plan',
            seq: 1,
            localId: null,
            createdAt: 1_000,
            content: {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'message',
                        message: ['<proposed_plan>', '## Summary', '', '- Ship native render', '</proposed_plan>'].join(
                            '\n'
                        ),
                    },
                },
            },
        })

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [
                {
                    type: 'tool-call',
                    name: 'proposed_plan',
                    input: {
                        plan: '## Summary\n\n- Ship native render',
                    },
                },
                {
                    type: 'tool-result',
                    content: {
                        plan: '## Summary\n\n- Ship native render',
                    },
                    is_error: false,
                },
            ],
        })
    })
})
