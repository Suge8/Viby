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
                        { type: 'thinking', thinking: '\n\t' }
                    ]
                }
            }
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
                        { type: 'text', text: 'hello' }
                    ]
                }
            }
        })

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [
                { type: 'text', text: 'hello' }
            ]
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
                        { type: 'text', text: 'done' }
                    ],
                    usage: {
                        input: 12,
                        output: 34
                    }
                }
            }
        })

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [
                { type: 'tool-call', id: 'tool-1', name: 'read_file', input: { path: 'README.md' } },
                { type: 'text', text: 'done' }
            ],
            usage: {
                input_tokens: 12,
                output_tokens: 34
            }
        })
    })

    it('normalizes legacy Pi assistant records stored under the codex wrapper', () => {
        const normalized = normalizeAgentRecord('assistant-pi-legacy', null, 1_000, {
            type: 'codex',
            data: {
                type: 'assistant',
                uuid: 'pi-legacy',
                message: {
                    content: [
                        { type: 'text', text: 'legacy pi reply' }
                    ],
                    usage: {
                        input: 1,
                        output: 2
                    }
                }
            }
        })

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [
                { type: 'text', text: 'legacy pi reply' }
            ],
            usage: {
                input_tokens: 1,
                output_tokens: 2
            }
        })
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
                            content: [
                                { type: 'text', text: 'reply from legacy pi transcript' }
                            ],
                            usage: {
                                input: 3,
                                output: 5
                            }
                        }
                    }
                }
            }
        })

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [
                { type: 'text', text: 'reply from legacy pi transcript' }
            ],
            usage: {
                input_tokens: 3,
                output_tokens: 5
            }
        })
    })
})
