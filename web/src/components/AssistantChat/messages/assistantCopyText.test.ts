import { describe, expect, it } from 'vitest'
import { extractAssistantCopyText } from './assistantCopyText'

describe('extractAssistantCopyText', () => {
    it('joins assistant text and reasoning content into one copy payload', () => {
        expect(extractAssistantCopyText([
            { type: 'reasoning', text: 'thinking' },
            { type: 'text', text: 'final answer' }
        ])).toBe('thinking\n\nfinal answer')
    })

    it('ignores tool calls and empty text fragments', () => {
        expect(extractAssistantCopyText([
            {
                type: 'tool-call',
                toolCallId: 'tool-1',
                toolName: 'search',
                args: {},
                argsText: '{}'
            },
            { type: 'text', text: '   ' }
        ])).toBeNull()
    })
})
