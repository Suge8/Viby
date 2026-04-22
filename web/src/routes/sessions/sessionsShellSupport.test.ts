import { describe, expect, it } from 'vitest'
import { shouldDispatchSessionIntent } from './sessionsShellSupport'

describe('sessionsShellSupport', () => {
    it('drops intent for the currently selected session', () => {
        expect(
            shouldDispatchSessionIntent({
                lastIntent: null,
                selectedSessionId: 'session-1',
                sessionId: 'session-1',
                source: 'hover',
                now: 100,
            })
        ).toBe(false)
    })

    it('dedupes repeated low-priority intent within the same short window', () => {
        expect(
            shouldDispatchSessionIntent({
                lastIntent: {
                    at: 100,
                    sessionId: 'session-1',
                    source: 'hover',
                },
                selectedSessionId: null,
                sessionId: 'session-1',
                source: 'hover',
                now: 180,
            })
        ).toBe(false)
    })

    it('allows a stronger intent source to upgrade an existing short-window hint', () => {
        expect(
            shouldDispatchSessionIntent({
                lastIntent: {
                    at: 100,
                    sessionId: 'session-1',
                    source: 'hover',
                },
                selectedSessionId: null,
                sessionId: 'session-1',
                source: 'press',
                now: 180,
            })
        ).toBe(true)
    })
})
