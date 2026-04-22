import { describe, expect, it } from 'bun:test'
import {
    describeScopedModules,
    parseScopeSpec,
    resolveModulesFromTouchedPaths,
    resolveScopedModules,
} from './qualityScope'

describe('quality scope', () => {
    it('parses explicit scope tokens once', () => {
        expect(parseScopeSpec('web, hub web')).toEqual(['web', 'hub'])
    })

    it('maps touched paths to audited modules', () => {
        expect(
            resolveModulesFromTouchedPaths([
                'web/src/App.tsx',
                'shared/src/schemas.ts',
                'docs/internal/harness-standards.md',
            ])
        ).toEqual(['web', 'shared'])
    })

    it('prefers explicit module scope over touched paths', () => {
        expect(
            resolveScopedModules({
                scopeSpec: 'hub',
                touchedPaths: ['web/src/App.tsx'],
            })
        ).toEqual(['hub'])
    })

    it('falls back to touched modules when no explicit scope is provided', () => {
        expect(
            resolveScopedModules({
                touchedPaths: ['desktop/src/App.tsx', 'shared/src/index.ts'],
            })
        ).toEqual(['desktop', 'shared'])
    })

    it('accepts pairing as an audited explicit scope', () => {
        expect(
            resolveScopedModules({
                scopeSpec: 'pairing',
                touchedPaths: ['pairing/src/index.ts'],
            })
        ).toEqual(['pairing'])
        expect(
            describeScopedModules(['pairing'], {
                scopeSpec: 'pairing',
                touchedPaths: ['pairing/src/index.ts'],
            })
        ).toContain('explicit scope: pairing')
    })
})
