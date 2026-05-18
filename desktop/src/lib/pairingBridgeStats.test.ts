import { describe, expect, it } from 'bun:test'
import { createPairingTunnelRouteState, reducePairingTunnelRoute } from '@viby/protocol/pairing'
import { readDesktopTunnelDirectCandidateEvent, readDesktopTunnelRouteStats } from './desktopTunnelRoute'
import { readPairingBridgeStats, startPairingBridgeStats } from './pairingBridgeStats'

function statsReport(stats: Array<Record<string, unknown>>) {
    const byId = new Map(stats.map((stat) => [String(stat.id), stat]))
    return {
        get: (id: string) => byId.get(id),
        forEach: (callback: (stat: Record<string, unknown>) => void) => {
            for (const stat of stats) callback(stat)
        },
    }
}

describe('readPairingBridgeStats', () => {
    it('classifies direct candidate pairs with RTT', () => {
        const stats = readPairingBridgeStats(
            statsReport([
                { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair' },
                {
                    id: 'pair',
                    type: 'candidate-pair',
                    localCandidateId: 'local',
                    remoteCandidateId: 'remote',
                    currentRoundTripTime: 0.028,
                },
                { id: 'local', candidateType: 'host' },
                { id: 'remote', candidateType: 'srflx' },
            ])
        )

        expect(stats).toMatchObject({
            transport: 'direct',
            localCandidateType: 'host',
            remoteCandidateType: 'srflx',
            currentRoundTripTimeMs: 28,
        })
    })

    it('classifies TURN relay candidate pairs', () => {
        const stats = readPairingBridgeStats(
            statsReport([
                { id: 'pair', type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'local' },
                { id: 'local', candidateType: 'relay' },
            ])
        )

        expect(stats.transport).toBe('relay')
        expect(stats.localCandidateType).toBe('relay')
    })

    it('keeps previous transport only while the selected pair is unavailable', () => {
        expect(readPairingBridgeStats(statsReport([]), 'direct')).toMatchObject({
            transport: 'unknown',
            previousTransport: 'direct',
        })
    })

    it('samples peer stats only when requested', async () => {
        let calls = 0
        const sampler = startPairingBridgeStats({
            getPeer: () =>
                ({
                    getStats: async () => {
                        calls += 1
                        return statsReport([])
                    },
                }) as unknown as RTCPeerConnection,
            setStats: () => {},
            reportError: () => {},
        })

        await Promise.resolve()
        expect(calls).toBe(0)
        expect(await sampler.sample()).toMatchObject({ transport: 'unknown' })
        expect(calls).toBe(1)
        sampler.dispose()
        expect(await sampler.sample()).toBeNull()
        expect(calls).toBe(1)
    })

    it('maps relay-active route telemetry to desktop bridge stats', () => {
        const routeState = reducePairingTunnelRoute(createPairingTunnelRouteState(), {
            type: 'relay-ready',
            roundTripTimeMs: 118,
        })

        expect(readDesktopTunnelRouteStats(routeState, null)).toEqual({
            transport: 'relay',
            previousTransport: null,
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: 118,
            restartCount: 0,
        })
    })

    it('builds direct candidate events from desktop stats samples', () => {
        expect(
            readDesktopTunnelDirectCandidateEvent({
                transport: 'direct',
                previousTransport: null,
                localCandidateType: 'srflx',
                remoteCandidateType: 'host',
                currentRoundTripTimeMs: 42,
                restartCount: 0,
            })
        ).toEqual({
            type: 'direct-candidate-selected',
            candidateType: 'srflx',
            roundTripTimeMs: 42,
        })
    })
})
