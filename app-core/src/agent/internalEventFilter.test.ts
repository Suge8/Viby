import { describe, expect, it } from 'vitest'
import { isInternalEventJson } from './internalEventFilter'

describe('isInternalEventJson', () => {
    it('matches only leaked internal output envelopes', () => {
        expect(isInternalEventJson('plain text')).toBe(false)
        expect(isInternalEventJson('{"type":"output","data":{"text":"visible"}}')).toBe(false)
        expect(
            isInternalEventJson(
                JSON.stringify({
                    type: 'output',
                    data: {
                        parentUuid: null,
                        sessionId: 'session-1',
                        userType: 'external',
                    },
                })
            )
        ).toBe(true)
    })
})
