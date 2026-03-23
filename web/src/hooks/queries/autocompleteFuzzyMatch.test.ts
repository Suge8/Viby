import { describe, expect, it } from 'vitest'
import {
    getAutocompleteMatchScore,
    getAutocompleteSearchTerm
} from '@/hooks/queries/autocompleteFuzzyMatch'

describe('autocompleteFuzzyMatch', () => {
    it('normalizes prefixed query text into a lowercase search term', () => {
        expect(getAutocompleteSearchTerm('/Review', '/')).toBe('review')
        expect(getAutocompleteSearchTerm('$Build', '$')).toBe('build')
        expect(getAutocompleteSearchTerm('Plain', '/')).toBe('plain')
    })

    it('keeps direct, prefix, substring, and fuzzy matches in ascending score order', () => {
        const searchTerm = 'review'

        expect(getAutocompleteMatchScore(searchTerm, 'review')).toBe(0)
        expect(getAutocompleteMatchScore(searchTerm, 'reviewer')).toBe(1)
        expect(getAutocompleteMatchScore(searchTerm, 'codex-review')).toBe(2)
        expect(getAutocompleteMatchScore(searchTerm, 'reviev')).toBeGreaterThan(2)
        expect(Number.isFinite(getAutocompleteMatchScore(searchTerm, 'status'))).toBe(false)
    })
})
