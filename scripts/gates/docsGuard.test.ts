import { describe, expect, it } from 'bun:test'
import { collectDocsGuardViolations, DOCS_GUARD_RULES, filterDocsGuardViolations } from './docsGuard'

describe('docs guard', () => {
    it('only gates the hard doc invariants, not gardening rules', () => {
        expect([...DOCS_GUARD_RULES].sort()).toEqual(['absolute-repo-path', 'structured-doc-leak'])
    })

    it('keeps gate-worthy violations and drops gardening violations', () => {
        const filtered = filterDocsGuardViolations([
            { rule: 'structured-doc-leak', file: 'hub/README.md', message: 'forbidden phrase leaked into doc: daemon' },
            { rule: 'absolute-repo-path', file: 'docs/x.md', message: 'replace absolute local path' },
            { rule: 'broken-doc-ref', file: 'docs/x.md', message: 'referenced path does not exist' },
            { rule: 'docs-readme-coverage', file: 'docs/README.md', message: 'missing docs index entry' },
            { rule: 'structured-doc-length', file: 'web/AGENTS.md', message: 'expected <= 120 lines' },
        ])
        expect(filtered.map((violation) => violation.rule)).toEqual(['structured-doc-leak', 'absolute-repo-path'])
    })

    it('passes on the current repository (READMEs stay product-facing)', () => {
        expect(collectDocsGuardViolations()).toEqual([])
    })
})
