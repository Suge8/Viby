import { describe, expect, it } from 'vitest'
import { createSessionListElement, createSessionSummary } from './SessionList.support'

describe('SessionList test support', () => {
    it('builds reusable test fixtures for dependent suites', () => {
        expect(createSessionSummary({ id: 'fixture-id' }).id).toBe('fixture-id')
        expect(createSessionListElement({ sessions: [] })).toBeTruthy()
    })
})
