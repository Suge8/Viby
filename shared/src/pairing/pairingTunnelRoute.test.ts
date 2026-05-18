import { describe, expect, it } from 'bun:test'
import {
    createPairingTunnelRouteState,
    type PairingTunnelRouteState,
    readPairingTunnelTelemetry,
    reducePairingTunnelRoute,
    resolvePairingTunnelDirectCandidateType,
    shouldReprobePairingDirect,
} from './pairingTunnelRoute'

function applyEvents(events: Parameters<typeof reducePairingTunnelRoute>[1][]): PairingTunnelRouteState {
    return events.reduce((state, event) => reducePairingTunnelRoute(state, event), createPairingTunnelRouteState())
}

describe('pairingTunnelRoute', () => {
    it('makes relay ready without waiting for direct punching', () => {
        const state = reducePairingTunnelRoute(createPairingTunnelRouteState(), {
            type: 'relay-ready',
            roundTripTimeMs: 90,
        })

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'relay',
            activeTransport: 'relay-wss',
            relayAvailable: true,
            routeSwitches: 0,
            roundTripTimeMs: 90,
        })
    })

    it('keeps relay active while direct probe is still gathering proof', () => {
        const state = applyEvents([
            { type: 'relay-ready' },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'srflx', roundTripTimeMs: 35 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 35 },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'relay',
            directProbe: 'probing',
            directAckCount: 1,
            roundTripTimeMs: null,
            routeSwitches: 0,
        })
    })

    it('keeps active relay RTT while direct probe has not earned promotion', () => {
        const state = applyEvents([
            { type: 'relay-ready', roundTripTimeMs: 90 },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'srflx', roundTripTimeMs: 35 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 35 },
        ])

        expect(state).toMatchObject({
            activeRoute: 'relay',
            roundTripTimeMs: 90,
        })
    })

    it('promotes direct after direct candidate and heartbeat evidence', () => {
        const state = applyEvents([
            { type: 'relay-ready', roundTripTimeMs: 80 },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'host', roundTripTimeMs: 12 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 12 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 11 },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'direct',
            activeTransport: 'direct-webrtc',
            relayAvailable: true,
            directProbe: 'usable',
            routeSwitches: 1,
            roundTripTimeMs: 11,
        })
    })

    it('does not promote TURN relay candidates as direct P2P', () => {
        const state = applyEvents([
            { type: 'relay-ready' },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'relay' },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 40 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 38 },
        ])

        expect(state).toMatchObject({
            activeRoute: 'relay',
            directProbe: 'failed',
            directProbeFailures: 1,
            routeSwitches: 0,
        })
    })

    it('falls back to relay when direct fails', () => {
        const state = applyEvents([
            { type: 'relay-ready' },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'srflx' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'direct-failed', reason: 'network-change' },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'relay',
            activeTransport: 'relay-wss',
            directProbe: 'failed',
            directProbeFailures: 1,
            routeSwitches: 2,
        })
    })

    it('demotes active direct when the selected candidate becomes TURN relay', () => {
        const state = applyEvents([
            { type: 'relay-ready' },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'srflx' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'direct-candidate-selected', candidateType: 'relay' },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'relay',
            directProbe: 'failed',
            directProbeFailures: 1,
            routeSwitches: 2,
        })
    })

    it('demotes stale direct after missed ack budget', () => {
        const state = applyEvents([
            { type: 'relay-ready' },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'prflx' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'heartbeat-missed', route: 'direct' },
            { type: 'heartbeat-missed', route: 'direct' },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'relay',
            directProbe: 'failed',
            directProbeFailures: 1,
            missedAcks: 0,
            routeSwitches: 2,
        })
    })

    it('requires stronger proof before reprobe promotes direct after fallback', () => {
        const state = applyEvents([
            { type: 'relay-ready' },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'host' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'direct-failed' },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'srflx' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'heartbeat-ack', route: 'direct' },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'direct',
            directProbe: 'usable',
            directProbeFailures: 1,
            routeSwitches: 3,
        })
    })

    it('keeps relay when direct RTT does not beat relay by enough margin', () => {
        const state = applyEvents([
            { type: 'relay-ready', roundTripTimeMs: 70 },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'srflx', roundTripTimeMs: 68 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 68 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 66 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 66 },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'relay',
            directProbe: 'probing',
            routeSwitches: 0,
            roundTripTimeMs: 70,
        })
    })

    it('keeps duplicate ready events from inflating route switches', () => {
        const state = applyEvents([
            { type: 'relay-ready' },
            { type: 'relay-ready' },
            { type: 'relay-ready', roundTripTimeMs: 70 },
        ])

        expect(state.routeSwitches).toBe(0)
        expect(state.roundTripTimeMs).toBe(70)
    })

    it('exposes telemetry without reducer-only fields', () => {
        const state = applyEvents([{ type: 'relay-ready' }, { type: 'direct-probe-started' }])

        expect(readPairingTunnelTelemetry(state)).toEqual({
            activeRoute: 'relay',
            activeTransport: 'relay-wss',
            relayAvailable: true,
            directProbe: 'probing',
            directCandidateType: null,
            roundTripTimeMs: null,
            missedAcks: 0,
            routeSwitches: 0,
            directProbeFailures: 0,
        })
    })

    it('reprobes direct only while relay is usable and no direct probe is running', () => {
        const relayReady = reducePairingTunnelRoute(createPairingTunnelRouteState(), { type: 'relay-ready' })
        const probing = reducePairingTunnelRoute(relayReady, { type: 'direct-probe-started' })
        const directReady = applyEvents([
            { type: 'relay-ready' },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'srflx' },
            { type: 'heartbeat-ack', route: 'direct' },
            { type: 'heartbeat-ack', route: 'direct' },
        ])

        expect(shouldReprobePairingDirect(relayReady)).toBe(true)
        expect(shouldReprobePairingDirect(probing)).toBe(false)
        expect(shouldReprobePairingDirect(directReady)).toBe(false)
    })

    it('normalizes observed ICE stats into direct probe candidate events', () => {
        expect(
            resolvePairingTunnelDirectCandidateType({
                transport: 'direct',
                localCandidateType: 'host',
                remoteCandidateType: 'srflx',
            })
        ).toBe('host')
        expect(
            resolvePairingTunnelDirectCandidateType({
                transport: 'direct',
                localCandidateType: 'unknown',
                remoteCandidateType: 'prflx',
            })
        ).toBe('prflx')
        expect(resolvePairingTunnelDirectCandidateType({ transport: 'relay' })).toBe('relay')
        expect(resolvePairingTunnelDirectCandidateType({ transport: 'unknown' })).toBeNull()
    })
})
