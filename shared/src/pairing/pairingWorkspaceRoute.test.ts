import { describe, expect, it } from 'bun:test'
import {
    hasPairingWorkspaceIntent,
    PAIRING_PWA_HANDOFF_PARAM,
    PAIRING_PWA_MANIFEST_PAIRING_PARAM,
    readPairingWorkspacePairingId,
    withPairingWorkspaceIdentity,
    withPairingWorkspaceIntent,
} from './pairingWorkspaceRoute'

describe('pairingWorkspaceRoute', () => {
    it('requires explicit remote intent on workspace routes', () => {
        expect(hasPairingWorkspaceIntent('/sessions', '')).toBe(false)
        expect(hasPairingWorkspaceIntent('/sessions', '?remote=1')).toBe(true)
        expect(hasPairingWorkspaceIntent('/sessions', '?Remote=1')).toBe(true)
        expect(hasPairingWorkspaceIntent('/sessions', '?REMOTE=1')).toBe(true)
        expect(hasPairingWorkspaceIntent('/sessions/session-1', '?remote=1')).toBe(true)
        expect(hasPairingWorkspaceIntent('/p/pairing-1', '?remote=1')).toBe(false)
    })

    it('adds remote intent without dropping existing search or hash', () => {
        expect(withPairingWorkspaceIntent('/sessions/session-1?section=history#top')).toBe(
            '/sessions/session-1?section=history&remote=1#top'
        )
        expect(withPairingWorkspaceIntent('/sessions/session-1?Remote=1#top')).toBe('/sessions/session-1?remote=1#top')
    })

    it('adds the public pairing identity without treating it as a secret', () => {
        expect(withPairingWorkspaceIdentity('/sessions/session-1?section=history#top', 'pairing-1')).toBe(
            '/sessions/session-1?section=history&remote=1&pairing=pairing-1#top'
        )
        expect(readPairingWorkspacePairingId('/sessions', '?remote=1&pairing=pairing-1')).toBe('pairing-1')
        expect(readPairingWorkspacePairingId('/p/pairing-1', '?remote=1&pairing=pairing-1')).toBeNull()
    })

    it('does not tag non-workspace links', () => {
        expect(withPairingWorkspaceIntent('/p/pairing-1#extra=value')).toBe('/p/pairing-1#extra=value')
    })

    it('keeps PWA handoff parameter names canonical', () => {
        expect(PAIRING_PWA_HANDOFF_PARAM).toBe('handoff')
        expect(PAIRING_PWA_MANIFEST_PAIRING_PARAM).toBe('pairing')
    })
})
