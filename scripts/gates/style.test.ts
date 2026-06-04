import { describe, expect, it } from 'bun:test'
import { resolveStyleCheckFiles, shouldStyleCheckFile } from './style'

describe('style check', () => {
    it('filters supported style-check file types', () => {
        expect(shouldStyleCheckFile('web/src/App.tsx')).toBe(true)
        expect(shouldStyleCheckFile('docs/internal/verification-standards.md')).toBe(true)
        expect(shouldStyleCheckFile('docs/internal/browser-observability.md')).toBe(true)
        expect(shouldStyleCheckFile('app-core/src/runtime/embeddedAssets.bun.ts')).toBe(false)
        expect(shouldStyleCheckFile('web/dist/index.html')).toBe(false)
        expect(shouldStyleCheckFile('pairing/deploy-bundle/index.js')).toBe(false)
    })

    it('resolves explicit files and skips unsupported entries', () => {
        const result = resolveStyleCheckFiles({
            explicitFiles: ['scripts/gates/style.ts', 'docs/internal/verification-standards.md', 'web/dist/index.html'],
            touchedPaths: [],
        })

        expect(result.checkedFiles).toEqual(['scripts/gates/style.ts', 'docs/internal/verification-standards.md'])
        expect(result.skippedFiles).toEqual(['web/dist/index.html'])
    })

    it('limits scoped runs to files inside the explicit module roots', () => {
        const result = resolveStyleCheckFiles({
            scopeSpec: 'web',
            touchedPaths: [
                'web/src/App.tsx',
                'docs/internal/verification-standards.md',
                'scripts/gates/style.ts',
                'app-core/src/index.ts',
            ],
        })

        expect(result.checkedFiles).toEqual(['web/src/App.tsx'])
        expect(result.skippedFiles).toEqual([])
    })
})
