import { describe, expect, it } from 'vitest'
import { readRemotePeerTransportStats } from './remotePairingStats'

function createPeer(report: RTCStatsReport): RTCPeerConnection {
    return {
        getStats: async () => report,
    } as RTCPeerConnection
}

function createReport(entries: [string, RTCStats][]): RTCStatsReport {
    return new Map(entries) as RTCStatsReport
}

describe('remotePairingStats', () => {
    it('detects direct selected candidate pairs', async () => {
        const stats = await readRemotePeerTransportStats(
            createPeer(
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
                            currentRoundTripTime: 0.018,
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
            ),
            123
        )

        expect(stats).toEqual({
            transport: 'direct',
            transportMode: 'direct-webrtc',
            localCandidateType: 'host',
            remoteCandidateType: 'srflx',
            currentRoundTripTimeMs: 18,
            previousTransport: null,
            sampledAt: 123,
            staleAfterMs: 15_000,
            routeRevision: 0,
        })
    })

    it('detects relay selected candidate pairs', async () => {
        const stats = await readRemotePeerTransportStats(
            createPeer(
                createReport([
                    [
                        'pair',
                        {
                            id: 'pair',
                            timestamp: 1,
                            type: 'candidate-pair',
                            nominated: true,
                            state: 'succeeded',
                            localCandidateId: 'local',
                            remoteCandidateId: 'remote',
                        } as RTCStats,
                    ],
                    [
                        'local',
                        { id: 'local', timestamp: 1, type: 'local-candidate', candidateType: 'relay' } as RTCStats,
                    ],
                    [
                        'remote',
                        { id: 'remote', timestamp: 1, type: 'remote-candidate', candidateType: 'srflx' } as RTCStats,
                    ],
                ])
            ),
            123
        )

        expect(stats.transport).toBe('relay')
    })

    it('keeps transport unknown when selected candidate types are missing', async () => {
        const stats = await readRemotePeerTransportStats(
            createPeer(
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
                    ['local', { id: 'local', timestamp: 1, type: 'local-candidate' } as RTCStats],
                    ['remote', { id: 'remote', timestamp: 1, type: 'remote-candidate' } as RTCStats],
                ])
            ),
            123
        )

        expect(stats).toEqual({
            transport: 'unknown',
            transportMode: 'unknown',
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: null,
            previousTransport: null,
            sampledAt: 123,
            staleAfterMs: 15_000,
            routeRevision: 0,
        })
    })
})
