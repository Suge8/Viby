import { describe, expect, it } from 'bun:test'
import { PairingVerifyCodeRequestSchema } from '../../shared/src/pairing'
import {
    buildPairingSmokeVerifyCodeRequest,
    DIRECT_WEBRTC_SMOKE_PUBLIC_KEY,
    REMOTE_NAT_DIRECT_WEBRTC_SMOKE_PUBLIC_KEY,
} from '../test-support/pairingSmokeContracts'

describe('pairing smoke contracts', () => {
    it('builds verify-code payloads through the shared pairing schema', () => {
        const direct = buildPairingSmokeVerifyCodeRequest({
            code: '123456',
            label: 'Direct WebRTC Guest',
            publicKey: DIRECT_WEBRTC_SMOKE_PUBLIC_KEY,
        })
        const remoteNat = buildPairingSmokeVerifyCodeRequest({
            code: '654321',
            label: 'Remote Direct Guest',
            publicKey: REMOTE_NAT_DIRECT_WEBRTC_SMOKE_PUBLIC_KEY,
        })

        expect(PairingVerifyCodeRequestSchema.safeParse(direct).success).toBe(true)
        expect(PairingVerifyCodeRequestSchema.safeParse(remoteNat).success).toBe(true)
    })

    it('fails before network I/O when the smoke payload drifts from the protocol', () => {
        expect(() =>
            buildPairingSmokeVerifyCodeRequest({
                code: '123456',
                label: 'Direct WebRTC Guest',
                publicKey: '',
            })
        ).toThrow()
    })
})
