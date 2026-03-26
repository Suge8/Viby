import { describe, expect, it } from 'vitest'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'

function translate(key: string): string {
    return key
}

describe('formatUserFacingErrorMessage', () => {
    it('maps known error codes before looking at the raw message', () => {
        expect(formatUserFacingErrorMessage(
            { code: 'session_archived', message: 'Archived sessions must be restored before resuming' },
            {
                t: translate,
                fallbackKey: 'fallback',
                codeMap: {
                    session_archived: 'chat.resumeFailed.sessionArchived'
                }
            }
        )).toBe('chat.resumeFailed.sessionArchived')
    })

    it('maps known raw messages to translated copy', () => {
        expect(formatUserFacingErrorMessage(
            new Error('Resume session ID unavailable'),
            {
                t: translate,
                fallbackKey: 'fallback',
                messageMap: [
                    {
                        match: 'Resume session ID unavailable',
                        key: 'chat.resumeFailed.resumeUnavailable'
                    }
                ]
            }
        )).toBe('chat.resumeFailed.resumeUnavailable')
    })

    it('hides technical messages behind the contextual fallback', () => {
        expect(formatUserFacingErrorMessage(
            new Error('gRPC transport closed while reading session stream'),
            {
                t: translate,
                fallbackKey: 'error.session.load'
            }
        )).toBe('error.session.load')
    })

    it('returns the original message only when explicitly allowed', () => {
        expect(formatUserFacingErrorMessage(
            new Error('Please reconnect this session first.'),
            {
                t: translate,
                fallbackKey: 'fallback',
                allowPassthrough: true
            }
        )).toBe('Please reconnect this session first.')
    })
})
