import { createPairingTunnelRouteState, reducePairingTunnelRoute } from '@viby/protocol/pairing'
import { describe, expect, it } from 'vitest'
import { reduceRouteAfterPeerRpcFailure } from './remotePeerRouteFailure'

describe('reduceRouteAfterPeerRpcFailure', () => {
    it('marks relay as reconnecting after an RPC failure', () => {
        const ready = reducePairingTunnelRoute(createPairingTunnelRouteState(), {
            type: 'heartbeat-ack',
            route: 'relay',
            roundTripTimeMs: 20,
            sampledAt: 1,
        })

        const next = reduceRouteAfterPeerRpcFailure(ready, 'relay')

        expect(next.phase).toBe('reconnecting')
        expect(next.activeRoute).toBeNull()
    })

    it('demotes failed direct route to relay when relay is available', () => {
        const relayReady = reducePairingTunnelRoute(createPairingTunnelRouteState(), {
            type: 'heartbeat-ack',
            route: 'relay',
            roundTripTimeMs: 30,
            sampledAt: 1,
        })
        const probing = reducePairingTunnelRoute(relayReady, { type: 'direct-probe-started' })
        const selected = reducePairingTunnelRoute(probing, {
            type: 'direct-candidate-selected',
            candidateType: 'srflx',
            roundTripTimeMs: 10,
            sampledAt: 2,
        })
        const oneAck = reducePairingTunnelRoute(selected, {
            type: 'heartbeat-ack',
            route: 'direct',
            roundTripTimeMs: 10,
            sampledAt: 3,
        })
        const directReady = reducePairingTunnelRoute(oneAck, {
            type: 'heartbeat-ack',
            route: 'direct',
            roundTripTimeMs: 10,
            sampledAt: 4,
        })

        const next = reduceRouteAfterPeerRpcFailure(directReady, 'direct')

        expect(next.phase).toBe('ready')
        expect(next.activeRoute).toBe('relay')
        expect(next.directProbe).toBe('failed')
    })

    it('marks relay lost when relay RPC fails during a direct probe', () => {
        const relayReady = reducePairingTunnelRoute(createPairingTunnelRouteState(), {
            type: 'heartbeat-ack',
            route: 'relay',
            roundTripTimeMs: 30,
            sampledAt: 1,
        })
        const probing = reducePairingTunnelRoute(relayReady, { type: 'direct-probe-started' })

        const next = reduceRouteAfterPeerRpcFailure(probing, 'relay')

        expect(next.phase).toBe('reconnecting')
        expect(next.relayAvailable).toBe(false)
    })
})
