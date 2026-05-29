import {
    createPairingTunnelRouteState,
    type PairingTransportHandle,
    reducePairingTunnelRoute,
} from '@viby/protocol/pairing'
import { describe, expect, it } from 'vitest'
import { readRemotePairingRouteStats } from './remotePairingRouteStats'

function createReport(entries: [string, RTCStats][]): RTCStatsReport {
    return new Map(entries) as RTCStatsReport
}

function createTransport(report: RTCStatsReport): PairingTransportHandle {
    return {
        getPeer: () => ({ getStats: async () => report }) as RTCPeerConnection,
    } as unknown as PairingTransportHandle
}

function directRouteState() {
    return [
        { type: 'relay-ready' as const, roundTripTimeMs: 20, sampledAt: 100 },
        { type: 'direct-probe-started' as const },
        { type: 'heartbeat-ack' as const, route: 'direct' as const, roundTripTimeMs: 80, sampledAt: 120 },
        { type: 'heartbeat-ack' as const, route: 'direct' as const, roundTripTimeMs: 82, sampledAt: 140 },
    ].reduce((state, event) => reducePairingTunnelRoute(state, event), createPairingTunnelRouteState())
}

describe('remotePairingRouteStats', () => {
    it('trusts the route owner when active direct stats are opaque', async () => {
        const stats = await readRemotePairingRouteStats(directRouteState(), createTransport(createReport([])))

        expect(stats).toMatchObject({
            transport: 'direct',
            transportMode: 'direct-webrtc',
            currentRoundTripTimeMs: 82,
            sampledAt: 140,
            routeRevision: 1,
        })
    })

    it('fills missing WebRTC stats RTT from direct heartbeat telemetry', async () => {
        const stats = await readRemotePairingRouteStats(
            directRouteState(),
            createTransport(
                createReport([
                    [
                        'transport',
                        {
                            id: 'transport',
                            timestamp: 1,
                            type: 'transport',
                            selectedCandidatePairId: 'pair',
                        } as RTCStats,
                    ],
                    [
                        'pair',
                        {
                            id: 'pair',
                            timestamp: 1,
                            type: 'candidate-pair',
                            localCandidateId: 'local',
                            remoteCandidateId: 'remote',
                        } as RTCStats,
                    ],
                    [
                        'local',
                        { id: 'local', timestamp: 1, type: 'local-candidate', candidateType: 'host' } as RTCStats,
                    ],
                    [
                        'remote',
                        { id: 'remote', timestamp: 1, type: 'remote-candidate', candidateType: 'srflx' } as RTCStats,
                    ],
                ])
            )
        )

        expect(stats).toMatchObject({
            transport: 'direct',
            transportMode: 'direct-webrtc',
            localCandidateType: 'host',
            remoteCandidateType: 'srflx',
            currentRoundTripTimeMs: 82,
            sampledAt: 140,
        })
    })
})
