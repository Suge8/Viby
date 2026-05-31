import { describe, expect, it } from 'bun:test'
import {
    createPairingTunnelRouteState,
    type PairingTransportHandle,
    reducePairingTunnelRoute,
} from '../../../shared/src/pairing'
import { readRemotePairingDirectCandidateEvent } from '../../../web/src/remote/remotePairingRouteStats'
import { FakeRtcPeer } from './harness/fakeRtcPeer'
import { emptyStatsFixture, relaySelectedStatsFixture, webkitDirectStatsFixture } from './harness/webkitStatsFixtures'

function createTransport(peer: FakeRtcPeer): PairingTransportHandle {
    return {
        dispose() {},
        getPeer: () => peer,
        getSnapshot: () => ({ kind: 'ready' }),
        notifyForeground() {},
        requestIceRestart() {},
        subscribe: () => () => {},
        untilReady: async () => undefined,
    }
}

describe('pairing route seam integration', () => {
    it('maps WebKit selected-pair stats through the real remote seam into the route reducer', async () => {
        const peer = new FakeRtcPeer()
        peer.setStatsReport(webkitDirectStatsFixture())

        const event = await readRemotePairingDirectCandidateEvent(createTransport(peer))
        expect(event).toMatchObject({
            type: 'direct-candidate-selected',
            candidateType: 'srflx',
            roundTripTimeMs: null,
        })
        if (!event) throw new Error('expected direct candidate event')

        let state = reducePairingTunnelRoute(createPairingTunnelRouteState(), event)
        expect(state).toMatchObject({
            activeRoute: null,
            directBlockedReason: 'missing-ack',
            directCandidateType: 'srflx',
            directProbe: 'probing',
            phase: 'connecting',
        })

        state = reducePairingTunnelRoute(state, { type: 'heartbeat-ack', route: 'direct', sampledAt: 10 })
        state = reducePairingTunnelRoute(state, { type: 'heartbeat-ack', route: 'direct', sampledAt: 20 })

        expect(state).toMatchObject({
            activeRoute: 'direct',
            activeTransport: 'direct-webrtc',
            directBlockedReason: null,
            directProbe: 'usable',
            phase: 'ready',
        })
    })

    it('keeps WebRTC relay candidates as a blocked direct probe while relay-wss stays active', async () => {
        const peer = new FakeRtcPeer()
        peer.setStatsReport(relaySelectedStatsFixture())
        const event = await readRemotePairingDirectCandidateEvent(createTransport(peer))
        expect(event).toMatchObject({ type: 'direct-candidate-selected', candidateType: 'relay' })
        if (!event) throw new Error('expected relay candidate event')

        let state = reducePairingTunnelRoute(createPairingTunnelRouteState(), {
            type: 'relay-ready',
            roundTripTimeMs: 80,
            sampledAt: 1,
        })
        state = reducePairingTunnelRoute(state, event)
        state = reducePairingTunnelRoute(state, { type: 'heartbeat-ack', route: 'direct', sampledAt: 2 })
        state = reducePairingTunnelRoute(state, { type: 'heartbeat-ack', route: 'direct', sampledAt: 3 })

        expect(state).toMatchObject({
            activeRoute: 'relay',
            activeTransport: 'relay-wss',
            directBlockedReason: 'turn-candidate',
            directCandidateType: 'relay',
            directProbe: 'failed',
            phase: 'ready',
        })
    })

    it('returns no route event for empty getStats reports', async () => {
        const peer = new FakeRtcPeer()
        peer.setStatsReport(emptyStatsFixture())

        await expect(readRemotePairingDirectCandidateEvent(createTransport(peer))).resolves.toBeNull()
    })
})
