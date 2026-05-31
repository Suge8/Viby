import { describe, expect, it } from 'bun:test'
import {
    classifyFatalPairingClose,
    PAIRING_WS_CLOSE_INVALID_TOKEN,
    PAIRING_WS_CLOSE_REPLACED,
} from './pairingCloseCode'

describe('classifyFatalPairingClose', () => {
    it('treats an invalid-token close as terminal', () => {
        expect(classifyFatalPairingClose({ code: PAIRING_WS_CLOSE_INVALID_TOKEN, reason: 'invalid_token' })).toBe(
            'invalid_token'
        )
    })

    it('falls back to invalid_token when the 1008 close carries no reason', () => {
        expect(classifyFatalPairingClose({ code: PAIRING_WS_CLOSE_INVALID_TOKEN, reason: '' })).toBe('invalid_token')
    })

    it('treats a replaced close as terminal handoff, not a reconnect', () => {
        expect(classifyFatalPairingClose({ code: PAIRING_WS_CLOSE_REPLACED, reason: 'replaced' })).toBe('replaced')
    })

    it('treats a 1000 bye reason (pairing_unavailable / user_revoked) as terminal', () => {
        // The broker sends `bye` then closes 1000 for a deleted/expired or
        // revoked pairing; both ends must stop reconnecting on that reason.
        expect(classifyFatalPairingClose({ code: 1000, reason: 'pairing_unavailable' })).toBe('pairing_unavailable')
        expect(classifyFatalPairingClose({ code: 1000, reason: 'user_revoked' })).toBe('user_revoked')
        expect(classifyFatalPairingClose({ code: 1000, reason: 'invalid_device_proof' })).toBe('invalid_device_proof')
        expect(classifyFatalPairingClose({ code: 1000, reason: 'handoff_invalid' })).toBe('handoff_invalid')
    })

    it('treats a plain 1000 / network blip / our own close as transient (reconnect)', () => {
        expect(classifyFatalPairingClose({ code: 1000, reason: '' })).toBeNull()
        expect(classifyFatalPairingClose({ code: 1006, reason: '' })).toBeNull()
        expect(classifyFatalPairingClose({ code: 1012, reason: '' })).toBeNull()
        expect(classifyFatalPairingClose(undefined)).toBeNull()
    })
})
