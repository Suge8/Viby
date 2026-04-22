import { describe, expect, it } from 'bun:test'
import {
    extractImportSpecifiers,
    extractMarkdownPathRefs,
    listQualityScoreModules,
    parseDebtTrackerRows,
    sanitizeArtifactSegment,
} from './support'

describe('harness support', () => {
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
\`docs/internal/harness-activity-path.md\`
\`http://example.com\`
        `

        expect(extractMarkdownPathRefs(markdown)).toEqual([
            'docs/README.md',
            'docs/internal/harness-activity-path.md',
            'http://example.com',
        ])
    })

    it('parses debt tracker rows', () => {
        const markdown = `
| ID | Area | Severity | Status | Owner |
| --- | --- | --- | --- | --- |
| D-001 | Root | High | DONE | Core |
| D-002 | Web | Medium | OPEN | Web |
        `

        expect(parseDebtTrackerRows(markdown)).toEqual([
            { id: 'D-001', status: 'DONE' },
            { id: 'D-002', status: 'OPEN' },
        ])
    })

    it('lists modules in quality score table', () => {
        const markdown = `
| 模块 | 分数 | 判断 |
| --- | ---: | --- |
| \`web\` | 68 | note |
| \`hub\` | 72 | note |
        `

        expect(listQualityScoreModules(markdown)).toEqual(['web', 'hub'])
    })
})
