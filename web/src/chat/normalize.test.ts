import { describe, expect, it } from 'vitest'
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
})
