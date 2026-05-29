import { describe, expect, it } from 'bun:test'
import {
    createPairingTunnelRouteState,
    type PairingTunnelRouteState,
    readPairingTunnelTelemetry,
    reducePairingTunnelRoute,
    resolvePairingTunnelDirectCandidateType,
    shouldReprobePairingDirect,
    shouldRequestPairingDirectProbeAck,
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

    it('can make relay ready from a heartbeat ack after protocol compatibility succeeds', () => {
        const state = reducePairingTunnelRoute(createPairingTunnelRouteState(), {
            type: 'heartbeat-ack',
            route: 'relay',
            roundTripTimeMs: 75,
            sampledAt: 123,
        })

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'relay',
            activeTransport: 'relay-wss',
            relayAvailable: true,
            routeSwitches: 0,
            roundTripTimeMs: 75,
            roundTripSampledAt: 123,
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

    it('promotes direct from heartbeat proof when browser ICE stats are opaque', () => {
        const state = applyEvents([
            { type: 'relay-ready', roundTripTimeMs: 80 },
            { type: 'direct-probe-started' },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 18 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 19 },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'direct',
            activeTransport: 'direct-webrtc',
            directCandidateType: null,
            directBlockedReason: null,
            directProbe: 'usable',
            routeSwitches: 1,
            roundTripTimeMs: 19,
        })
    })

    it('rejects relay candidates and keeps WSS relay active', () => {
        const state = applyEvents([
            { type: 'relay-ready', roundTripTimeMs: 80 },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'relay', roundTripTimeMs: 40 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 40 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 38 },
        ])

        expect(state).toMatchObject({
            activeRoute: 'relay',
            activeTransport: 'relay-wss',
            directProbe: 'failed',
            directBlockedReason: 'turn-candidate',
            directProbeFailures: 0,
            routeSwitches: 0,
        })
    })

    it('unblocks reprobe when direct heartbeat times out before promotion', () => {
        const state = applyEvents([
            { type: 'relay-ready', roundTripTimeMs: 80 },
            { type: 'direct-probe-started' },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 18 },
            { type: 'heartbeat-missed', route: 'direct' },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'relay',
            directProbe: 'failed',
            directAckCount: 0,
            directBlockedReason: 'heartbeat-missed',
            directProbeFailures: 1,
        })
        expect(shouldReprobePairingDirect(state)).toBe(true)
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

    it('demotes active direct to WSS when the selected candidate becomes relay', () => {
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
            activeTransport: 'relay-wss',
            directProbe: 'failed',
            directBlockedReason: 'turn-candidate',
            directProbeFailures: 0,
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

    it('promotes proven P2P even when the relay RTT is lower', () => {
        const state = applyEvents([
            { type: 'relay-ready', roundTripTimeMs: 20 },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'srflx', roundTripTimeMs: 80 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 80 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 82 },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'direct',
            activeTransport: 'direct-webrtc',
            directProbe: 'usable',
            directBlockedReason: null,
            routeSwitches: 1,
            roundTripTimeMs: 82,
        })
    })

    it('keeps WSS relay even when relay candidate has lower RTT', () => {
        const state = applyEvents([
            { type: 'relay-ready', roundTripTimeMs: 70 },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'relay', roundTripTimeMs: 30 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 30 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 30 },
        ])

        expect(state).toMatchObject({
            phase: 'ready',
            activeRoute: 'relay',
            activeTransport: 'relay-wss',
            directProbe: 'failed',
            directBlockedReason: 'turn-candidate',
            routeSwitches: 0,
        })
    })

    it('does not promote relay candidate before later WSS relay samples land', () => {
        const state = applyEvents([
            { type: 'relay-ready', roundTripTimeMs: 90, sampledAt: 1_000 },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'relay', roundTripTimeMs: 40, sampledAt: 1_100 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 40, sampledAt: 1_120 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 40, sampledAt: 1_140 },
            { type: 'heartbeat-ack', route: 'relay', roundTripTimeMs: 35, sampledAt: 1_200 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 70, sampledAt: 1_240 },
        ])

        expect(state).toMatchObject({
            activeRoute: 'relay',
            activeTransport: 'relay-wss',
            directBlockedReason: 'turn-candidate',
            roundTripTimeMs: 35,
            roundTripSampledAt: 1_200,
        })
    })

    it('keeps relay RTT freshness while direct is active', () => {
        const state = applyEvents([
            { type: 'relay-ready', roundTripTimeMs: 80, sampledAt: 1_000 },
            { type: 'direct-probe-started' },
            { type: 'direct-candidate-selected', candidateType: 'srflx', roundTripTimeMs: 40, sampledAt: 1_100 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 40, sampledAt: 1_120 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 40, sampledAt: 1_140 },
            { type: 'heartbeat-ack', route: 'relay', roundTripTimeMs: 85, sampledAt: 1_200 },
            { type: 'heartbeat-missed', route: 'direct' },
            { type: 'heartbeat-missed', route: 'direct' },
        ])

        expect(state).toMatchObject({
            activeRoute: 'relay',
            activeTransport: 'relay-wss',
            roundTripTimeMs: 85,
            roundTripSampledAt: 1_200,
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
            roundTripSampledAt: null,
            missedAcks: 0,
            routeSwitches: 0,
            routeRevision: 0,
            directProbeFailures: 0,
            directBlockedReason: 'missing-ack',
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
        expect(
            shouldReprobePairingDirect(
                applyEvents([
                    { type: 'relay-ready', roundTripTimeMs: 80 },
                    { type: 'direct-probe-started' },
                    { type: 'direct-candidate-selected', candidateType: 'relay', roundTripTimeMs: 40 },
                    { type: 'heartbeat-ack', route: 'direct' },
                    { type: 'heartbeat-ack', route: 'direct' },
                ])
            )
        ).toBe(true)
    })

    it('requests immediate direct probe ACKs only while missing heartbeat proof', () => {
        const firstAck = applyEvents([
            { type: 'relay-ready', roundTripTimeMs: 80 },
            { type: 'direct-probe-started' },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 18 },
        ])
        const promoted = reducePairingTunnelRoute(firstAck, {
            type: 'heartbeat-ack',
            route: 'direct',
            roundTripTimeMs: 19,
        })
        const slowerDirect = applyEvents([
            { type: 'relay-ready', roundTripTimeMs: 20 },
            { type: 'direct-probe-started' },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 80 },
            { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 81 },
        ])

        expect(shouldRequestPairingDirectProbeAck(firstAck)).toBe(true)
        expect(shouldRequestPairingDirectProbeAck(promoted)).toBe(false)
        expect(shouldRequestPairingDirectProbeAck(slowerDirect)).toBe(false)
        expect(slowerDirect.activeRoute).toBe('direct')
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
