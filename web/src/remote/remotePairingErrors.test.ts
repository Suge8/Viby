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
        const error = createRemotePairingCodedError('remotePairing.error.closedRetrying')

        expect(getRemotePairingErrorKey(error)).toBe('remotePairing.error.closedRetrying')
        expect(getRemotePairingErrorMessage(error, t)).toBe('translated:remotePairing.error.closedRetrying')
    })

    it('keeps user-facing pairing errors on the same code path', () => {
        const error = createRemotePairingUserError('remotePairing.error.scanAgain')

        expect(getRemotePairingErrorMessage(error, t)).toBe('translated:remotePairing.error.scanAgain')
    })

    it('hides uncoded technical messages behind reconnect copy', () => {
        expect(getRemotePairingErrorMessage(new Error('bad offer'), t)).toBe(
            'translated:remotePairing.error.closedRetrying'
        )
    })

    it('hides retry actions for final scan-again states only', () => {
        expect(canRetryRemotePairingError('remotePairing.error.closedRetrying')).toBe(true)
        expect(canRetryRemotePairingError('remotePairing.error.scanAgain')).toBe(false)
        expect(canRetryRemotePairingError('remotePairing.error.connectionReplaced')).toBe(false)
        expect(canRetryRemotePairingError('remotePairing.error.updateDesktop')).toBe(false)
    })
})
