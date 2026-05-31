import { type PairingVerifyCodeRequest, PairingVerifyCodeRequestSchema } from '../../shared/src/pairing'

export const DIRECT_WEBRTC_SMOKE_PUBLIC_KEY = 'direct-webrtc-smoke-guest-public-key'
export const REMOTE_NAT_DIRECT_WEBRTC_SMOKE_PUBLIC_KEY = 'remote-direct-webrtc-smoke-guest-public-key'

export function buildPairingSmokeVerifyCodeRequest(input: {
    code: string
    label: string
    publicKey: string
}): PairingVerifyCodeRequest {
    return PairingVerifyCodeRequestSchema.parse(input)
}
