import { describe, expect, it } from 'bun:test'
import { auditDocs } from './docGardening'

describe('doc gardening', () => {
    it('returns a structured audit result', () => {
        const result = auditDocs()
        expect(Array.isArray(result.violations)).toBe(true)
        expect(Array.isArray(result.checkedFiles)).toBe(true)
        expect(result.markdown).toContain('Harness Docs Audit')
    })

    it('limits scoped audits to touched documentation files', () => {
        const result = auditDocs({
            scopeSpec: 'pairing',
            touchedPaths: ['pairing/README.md'],
        })

        expect(result.checkedFiles).toEqual(['pairing/README.md'])
        expect(result.markdown).toContain('explicit scope: pairing')
    })
})
