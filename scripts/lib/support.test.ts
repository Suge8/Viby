import { describe, expect, it } from 'bun:test'
import { extractImportSpecifiers, extractMarkdownPathRefs, sanitizeArtifactSegment } from './support'

describe('script support', () => {
    it('sanitizes artifact labels into stable path segments', () => {
        expect(sanitizeArtifactSegment('Viby / Session Chat')).toBe('viby-session-chat')
        expect(sanitizeArtifactSegment('   ')).toBe('artifact')
    })

    it('extracts static import specifiers', () => {
        const source = `
            import foo from './foo'
            const bar = await import("../bar")
            const baz = require('./baz')
        `

        expect(extractImportSpecifiers(source)).toEqual(['./foo', '../bar', './baz'])
    })

    it('extracts markdown path refs from links and backticks', () => {
        const markdown = `
[Docs](docs/README.md)
\`docs/internal/agent-workflow.md\`
\`http://example.com\`
        `

        expect(extractMarkdownPathRefs(markdown)).toEqual([
            'docs/README.md',
            'docs/internal/agent-workflow.md',
            'http://example.com',
        ])
    })
})
