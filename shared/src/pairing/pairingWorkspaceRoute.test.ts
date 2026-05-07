import { describe, expect, it } from 'bun:test'
import { hasPairingWorkspaceIntent, withPairingWorkspaceIntent } from './pairingWorkspaceRoute'

describe('pairingWorkspaceRoute', () => {
    it('requires explicit remote intent on workspace routes', () => {
        expect(hasPairingWorkspaceIntent('/sessions', '')).toBe(false)
        expect(hasPairingWorkspaceIntent('/sessions', '?remote=1')).toBe(true)
        expect(hasPairingWorkspaceIntent('/sessions/session-1', '?remote=1')).toBe(true)
        expect(hasPairingWorkspaceIntent('/p/pairing-1', '?remote=1')).toBe(false)
    })

    it('adds remote intent without dropping existing search or hash', () => {
        expect(withPairingWorkspaceIntent('/sessions/session-1?section=history#top')).toBe(
            '/sessions/session-1?section=history&remote=1#top'
        )
    })

    it('does not tag non-workspace links', () => {
        expect(withPairingWorkspaceIntent('/p/pairing-1#ticket=ticket-1')).toBe('/p/pairing-1#ticket=ticket-1')
    })
})
