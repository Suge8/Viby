import { describe, expect, it } from 'vitest'
import { RemotePeerConnectError } from './remotePairingErrors'
import { readRemotePeerTransportFatalError } from './remotePeerSessionRouteCommit'

describe('readRemotePeerTransportFatalError', () => {
    it('maps broker replacement close to the non-retryable replaced error', () => {
        const error = readRemotePeerTransportFatalError({ kind: 'fatal', reason: 'replaced' }, null)

        expect(error).toBeInstanceOf(RemotePeerConnectError)
        expect((error as RemotePeerConnectError).kind).toBe('replaced')
        expect((error as RemotePeerConnectError).code).toBe('remotePairing.error.connectionReplaced')
    })
})
