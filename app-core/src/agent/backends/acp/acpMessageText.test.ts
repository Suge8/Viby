import { describe, expect, it } from 'vitest'
import { extractTextContent, mergeTextChunk } from './acpMessageText'

describe('acp message text helpers', () => {
    it('filters text by explicit audience', () => {
        expect(extractTextContent({ type: 'text', text: 'visible' })).toBe('visible')
        expect(extractTextContent({ type: 'text', text: 'hidden', annotations: [{ audience: 'user' }] })).toBeNull()
        expect(extractTextContent({ type: 'text', text: 'visible', annotations: [{ audience: ['assistant'] }] })).toBe(
            'visible'
        )
    })

    it('merges cumulative and overlapping text chunks', () => {
        expect(mergeTextChunk('', 'hello')).toBe('hello')
        expect(mergeTextChunk('hello', 'hello world')).toBe('hello world')
        expect(mergeTextChunk('hello wo', 'world')).toBe('hello world')
        expect(mergeTextChunk('hello world', 'world')).toBe('hello world')
    })
})
