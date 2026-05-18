import { describe, expect, it } from 'bun:test'
import {
    createPairingTunnelRouteState,
    type PairingTunnelRouteEvent,
    reducePairingTunnelRoute,
} from '../../shared/src/pairing'

function replay(events: PairingTunnelRouteEvent[]) {
    return events.reduce((state, event) => reducePairingTunnelRoute(state, event), createPairingTunnelRouteState())
}

describe('pairing tunnel network simulation', () => {
    it('keeps relay usable when cellular NAT only produces TURN relay candidates', () => {
        const state = replay([
            { type: 'relay-ready', transport: 'relay-wss', roundTripTimeMs: 120 },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'relay', roundTripTimeMs: 160 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 150 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 145 },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'relay',
            directProbe: 'failed',
            directProbeFailures: 1,
            routeSwitches: 0,
        })
    })

    it('upgrades from relay to P2P when STUN reflexive path proves healthy', () => {
        const state = replay([
            { type: 'relay-ready', transport: 'relay-wss', roundTripTimeMs: 95 },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'srflx', roundTripTimeMs: 38 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 38 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 34 },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'direct',
            activeTransport: 'direct-webrtc',
            relayAvailable: true,
            routeSwitches: 1,
        })
    })

    it('falls back during a mobile network handover and reprobes back to direct', () => {
        const state = replay([
            { type: 'relay-ready' },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'host', roundTripTimeMs: 18 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 18 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 17 },
            { type: 'heartbeat-missed', route: 'direct' },
            { type: 'heartbeat-missed', route: 'direct' },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'prflx', roundTripTimeMs: 42 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 42 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 39 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 39 },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'direct',
            directProbe: 'usable',
            missedAcks: 0,
            routeSwitches: 3,
        })
    })

    it('keeps the reducer hot path cheap enough for continuous route events', () => {
        const events: PairingTunnelRouteEvent[] = [
            { type: 'relay-ready' },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'srflx' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'heartbeat-missed', route: 'direct' },
            { type: 'heartbeat-missed', route: 'direct' },
        ]
        const startedAt = performance.now()
        let state = createPairingTunnelRouteState()
        for (let i = 0; i < 20_000; i++) {
            state = events.reduce((next, event) => reducePairingTunnelRoute(next, event), state)
        }
        const elapsedMs = performance.now() - startedAt

        expect(state.phase).toBe('ready')
        expect(elapsedMs).toBeLessThan(1_000)
    })
})
