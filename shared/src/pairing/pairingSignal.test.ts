import { describe, expect, it } from 'bun:test'
import { PairingByeReasonSchema, PairingTransportSignalSchema } from './pairingSignal'

function parseAfterJsonRoundTrip(value: unknown) {
    return PairingTransportSignalSchema.parse(JSON.parse(JSON.stringify(value)))
}

describe('pairingTransportSignal', () => {
    it('round-trips description signals', () => {
        const signal = { type: 'description', description: { type: 'offer', sdp: 'v=0' } } as const
        expect(parseAfterJsonRoundTrip(signal)).toEqual(signal)
    })

    it('round-trips candidate signals with nullable fields', () => {
        const signal = {
            type: 'candidate',
            candidate: { candidate: 'candidate:1 1 udp 1 0.0.0.0 9 typ host', sdpMid: null, sdpMLineIndex: null },
        } as const
        expect(parseAfterJsonRoundTrip(signal)).toEqual(signal)
    })

    it('round-trips bye signals', () => {
        const signal = { type: 'bye', reason: 'user_revoked' } as const
        expect(parseAfterJsonRoundTrip(signal)).toEqual(signal)
    })

    it('round-trips peer replacement signals', () => {
        const signal = { type: 'peer-replaced' } as const
        expect(parseAfterJsonRoundTrip(signal)).toEqual(signal)
    })

    it('accepts every native description type', () => {
        for (const descriptionType of ['offer', 'answer', 'pranswer', 'rollback'] as const) {
            expect(
                PairingTransportSignalSchema.parse({ type: 'description', description: { type: descriptionType } })
            ).toEqual({
                type: 'description',
                description: { type: descriptionType },
            })
        }
    })

    it('rejects invalid bye reasons', () => {
        expect(PairingByeReasonSchema.safeParse('transport_rebuilt').success).toBe(false)
    })
})
