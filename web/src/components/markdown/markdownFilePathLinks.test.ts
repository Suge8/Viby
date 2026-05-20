import { describe, expect, it } from 'vitest'
import { readMarkdownSessionFilePath, remarkLinkSessionFilePaths } from './markdownFilePathLinks'

type TestNode = {
    type: string
    value?: string
    url?: string
    children?: TestNode[]
}

describe('remarkLinkSessionFilePaths', () => {
    it('turns explicit file paths into session-file links', () => {
        const tree: TestNode = {
            type: 'root',
            children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Open /repo/src/App.tsx:12 now' }] }],
        }

        remarkLinkSessionFilePaths()(tree)

        const children = tree.children?.[0]?.children ?? []
        expect(children[1]).toMatchObject({
            type: 'link',
            url: 'viby-session-file:%2Frepo%2Fsrc%2FApp.tsx',
        })
        expect(readMarkdownSessionFilePath(children[1]?.url)).toBe('/repo/src/App.tsx')
    })

    it('leaves inline code and existing links alone', () => {
        const tree: TestNode = {
            type: 'root',
            children: [
                {
                    type: 'paragraph',
                    children: [
                        { type: 'inlineCode', value: '/repo/src/App.tsx' },
                        {
                            type: 'link',
                            url: 'https://example.com',
                            children: [{ type: 'text', value: '/repo/src/App.tsx' }],
                        },
                    ],
                },
            ],
        }

        remarkLinkSessionFilePaths()(tree)

        expect(tree.children?.[0]?.children).toHaveLength(2)
        expect(tree.children?.[0]?.children?.[1]?.url).toBe('https://example.com')
    })
})
