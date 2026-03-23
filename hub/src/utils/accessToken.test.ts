import { describe, expect, it } from 'bun:test'
import { parseAccessToken } from './accessToken'

describe('parseAccessToken', () => {
    it('accepts a plain token', () => {
        expect(parseAccessToken('token')).toBe('token')
    })

    it('rejects namespace suffixes', () => {
        expect(parseAccessToken('token:alice')).toBeNull()
    })

    it('rejects empty suffix', () => {
        expect(parseAccessToken('token:')).toBeNull()
    })

    it('rejects missing token value', () => {
        expect(parseAccessToken(':alice')).toBeNull()
    })

    it('rejects whitespace around suffix separators', () => {
        expect(parseAccessToken('token: alice')).toBeNull()
    })
})
