import { afterEach, describe, expect, it, mock } from 'bun:test'
import type { DesktopPairingSession, PairingBridgeStats } from '@/types'
import { postPairingTelemetry } from './pairingBridgeTransportSupport'

const basePairing: DesktopPairingSession = {
    pairing: {
        id: 'pairing-1',
        state: 'waiting',
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 2,
        ticketExpiresAt: 2,
        shortCode: null,
        approvalStatus: null,
        host: {},
        guest: null,
    },
    hostToken: 'host-token',
    pairingUrl: 'https://pair.example.com/p/pairing-1#ticket=secret',
    wsUrl: 'wss://pair.example.com/pairings/pairing-1/ws?token=host-token',
    iceServers: [],
}

const relayStats: PairingBridgeStats = {
    transport: 'relay',
    localCandidateType: 'relay',
    remoteCandidateType: 'relay',
    currentRoundTripTimeMs: 85,
    restartCount: 2,
}

describe('pairingBridgeTransportSupport', () => {
    afterEach(() => {
        mock.restore()
    })

    it('posts host telemetry to the pairing broker http endpoint', async () => {
        const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toBe('https://pair.example.com/pairings/pairing-1/telemetry')
            expect(init?.method).toBe('POST')
            expect(init?.headers).toMatchObject({
                authorization: 'Bearer host-token',
                'content-type': 'application/json',
            })
            expect(JSON.parse(String(init?.body))).toMatchObject({
                sample: {
                    source: 'desktop',
                    transport: 'relay',
                    restartCount: 2,
                    sampledAt: 1_700_000_000_000,
                },
            })

            return new Response(JSON.stringify({ accepted: true }), { status: 200 })
        })
        globalThis.fetch = fetchMock as typeof fetch

        await postPairingTelemetry(basePairing, relayStats, 1_700_000_000_000)

        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
