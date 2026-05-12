import { describe, expect, it } from 'vitest'
import { RemotePeerSession } from './RemotePeerSession'
import { mapByeToErrorKey } from './remotePairingErrors'

describe('RemotePeerSession', () => {
    it('keeps the bridge class available for the controller', () => {
        expect(typeof RemotePeerSession).toBe('function')
        expect(typeof RemotePeerSession.prototype.untilReady).toBe('function')
    })

    it('maps broker bye reasons to user-facing errors', () => {
        expect(mapByeToErrorKey('pairing_unavailable')).toBe('remotePairing.error.scanAgain')
        expect(mapByeToErrorKey('invalid_token')).toBe('remotePairing.error.scanAgain')
        expect(mapByeToErrorKey('invalid_device_proof')).toBe('remotePairing.error.regenerateQr')
        expect(mapByeToErrorKey('handoff_invalid')).toBe('remotePairing.error.regenerateQr')
        expect(mapByeToErrorKey('user_revoked')).toBe('remotePairing.error.scanAgain')
    })
})
