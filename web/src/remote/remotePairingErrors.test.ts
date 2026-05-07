import { describe, expect, it } from 'vitest'
import {
    canRetryRemotePairingError,
    createRemotePairingCodedError,
    createRemotePairingUserError,
    getRemotePairingErrorKey,
    getRemotePairingErrorMessage,
} from './remotePairingErrors'

describe('remotePairingErrors', () => {
    const t = (key: string) => `translated:${key}`

    it('translates coded pairing errors without exposing raw Error.message', () => {
        const error = createRemotePairingCodedError('remotePairing.error.hostUnavailable')

        expect(getRemotePairingErrorKey(error)).toBe('remotePairing.error.hostUnavailable')
        expect(getRemotePairingErrorMessage(error, t)).toBe('translated:remotePairing.error.hostUnavailable')
    })

    it('keeps user-facing pairing errors on the same code path', () => {
        const error = createRemotePairingUserError('remotePairing.error.scanAgain')

        expect(getRemotePairingErrorMessage(error, t)).toBe('translated:remotePairing.error.scanAgain')
    })

    it('hides uncoded technical messages behind the fallback copy', () => {
        expect(getRemotePairingErrorMessage(new Error('bad offer'), t)).toBe('translated:remotePairing.error.fallback')
    })

    it('hides retry actions for final scan-again states only', () => {
        expect(canRetryRemotePairingError('remotePairing.error.socket')).toBe(true)
        expect(canRetryRemotePairingError('remotePairing.error.scanAgain')).toBe(false)
        expect(canRetryRemotePairingError('remotePairing.error.expired')).toBe(false)
    })
})
