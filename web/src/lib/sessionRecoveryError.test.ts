import { describe, expect, it } from 'vitest'
import { formatSessionRecoveryErrorMessage } from '@/lib/sessionRecoveryError'

function translate(key: string): string {
    return key
}

describe('formatSessionRecoveryErrorMessage', () => {
    it('maps known recovery error codes', () => {
        expect(formatSessionRecoveryErrorMessage(
            { code: 'no_machine_online', message: 'No machine online' },
            translate
        )).toBe('chat.resumeFailed.noMachineOnline')
    })

    it('maps the legacy resume token message', () => {
        expect(formatSessionRecoveryErrorMessage(
            new Error('Resume session ID unavailable'),
            translate
        )).toBe('chat.resumeFailed.resumeUnavailable')
    })

    it('falls back to generic copy for technical errors', () => {
        expect(formatSessionRecoveryErrorMessage(
            new Error('HTTP 409 Conflict: upstream transport failed'),
            translate
        )).toBe('chat.resumeFailed.generic')
    })
})
