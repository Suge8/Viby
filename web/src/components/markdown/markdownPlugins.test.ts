import { describe, expect, it } from 'vitest'
import { remarkStripCjkAutolinkPunctuation } from './markdownPlugins'

type TestNode = {
    type: string
    url?: string
    value?: string
    children?: TestNode[]
}

function createAutolink(url: string): TestNode {
    return {
        type: 'root',
        children: [
            {
                type: 'paragraph',
                children: [
                    { type: 'text', value: '见 ' },
                    { type: 'link', url, children: [{ type: 'text', value: url }] },
                ],
            },
        ],
    }
}

describe('remarkStripCjkAutolinkPunctuation', () => {
    it('moves CJK sentence punctuation out of autolink URLs', () => {
        const tree = createAutolink('https://example.com/path。）')
        remarkStripCjkAutolinkPunctuation()(tree)
        const paragraph = tree.children![0]
        const link = paragraph.children![1]

        expect(link.url).toBe('https://example.com/path')
        expect(link.children![0].value).toBe('https://example.com/path')
        expect(paragraph.children![2]).toEqual({ type: 'text', value: '。）' })
    })

    it('does not strip standalone fullwidth brackets from URL paths', () => {
        const tree = createAutolink('https://example.com/路径）')
        remarkStripCjkAutolinkPunctuation()(tree)
        const paragraph = tree.children![0]

        expect(paragraph.children![1].url).toBe('https://example.com/路径）')
        expect(paragraph.children).toHaveLength(2)
    })
})
