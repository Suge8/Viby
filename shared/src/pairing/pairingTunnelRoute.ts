import type {
    PairingTunnelCandidateType,
    PairingTunnelRoute,
    PairingTunnelTelemetry,
    PairingTunnelTransport,
} from './pairingTunnelFrame'
import {
    createPairingTunnelRouteState,
    DEFAULT_PAIRING_TUNNEL_ROUTE_OPTIONS,
    type PairingTunnelObservedTransport,
    type PairingTunnelRelayTransport,
    type PairingTunnelRouteEvent,
    type PairingTunnelRouteOptions,
    type PairingTunnelRouteState,
} from './pairingTunnelRouteTypes'

export {
    createPairingTunnelRouteState,
    DEFAULT_PAIRING_TUNNEL_ROUTE_OPTIONS,
    type PairingTunnelDirectProbe,
    type PairingTunnelObservedTransport,
    type PairingTunnelRouteEvent,
    type PairingTunnelRouteOptions,
    type PairingTunnelRoutePhase,
    type PairingTunnelRouteState,
} from './pairingTunnelRouteTypes'

const DEFAULT_RELAY_TRANSPORT: PairingTunnelRelayTransport = 'relay-wss'

export function reducePairingTunnelRoute(
    state: PairingTunnelRouteState,
    event: PairingTunnelRouteEvent,
    options: PairingTunnelRouteOptions = DEFAULT_PAIRING_TUNNEL_ROUTE_OPTIONS
): PairingTunnelRouteState {
    if (state.phase === 'fatal') return state

    switch (event.type) {
        case 'relay-ready':
            return handleRelayReady(
                state,
                event.transport ?? DEFAULT_RELAY_TRANSPORT,
                event.roundTripTimeMs,
                event.sampledAt
            )
        case 'relay-lost':
            return handleRelayLost(state)
        case 'direct-probe-started':
            return {
                ...state,
                directProbe: 'probing',
                directCandidateType: null,
                directProbeRoundTripTimeMs: null,
                directProbeSampledAt: null,
                directAckCount: 0,
                directBlockedReason: 'missing-ack',
            }
        case 'direct-candidate-selected':
            return handleDirectCandidate(
                state,
                event.candidateType,
                normalizeRtt(event.roundTripTimeMs),
                event.sampledAt,
                options
            )
        case 'direct-failed':
            return demoteDirect({
                ...state,
                directProbe: 'failed',
                directProbeFailures: state.directProbeFailures + 1,
                directBlockedReason: 'ice-failed',
            })
        case 'heartbeat-ack':
            return handleHeartbeatAck(state, event.route, normalizeRtt(event.roundTripTimeMs), event.sampledAt, options)
        case 'heartbeat-missed':
            return handleHeartbeatMissed(state, event.route, options)
        case 'fatal':
            return { ...state, phase: 'fatal', fatalReason: event.reason }
    }
}

export function readPairingTunnelTelemetry(state: PairingTunnelRouteState): PairingTunnelTelemetry {
    return {
        activeRoute: state.activeRoute,
        activeTransport: state.activeTransport,
        relayAvailable: state.relayAvailable,
        directProbe: state.directProbe,
        directCandidateType: state.directCandidateType,
        roundTripTimeMs: state.roundTripTimeMs,
        roundTripSampledAt: state.roundTripSampledAt,
        missedAcks: state.missedAcks,
        routeSwitches: state.routeSwitches,
        routeRevision: state.routeRevision,
        directProbeFailures: state.directProbeFailures,
        directBlockedReason: state.directBlockedReason,
    }
}

export function shouldReprobePairingDirect(state: PairingTunnelRouteState): boolean {
    return (
        (state.activeTransport === 'relay-wss' || state.activeTransport === 'turn-webrtc') &&
        state.directProbe !== 'probing'
    )
}

function handleRelayReady(
    state: PairingTunnelRouteState,
    transport: PairingTunnelRelayTransport,
    roundTripTimeMs: number | null | undefined,
    sampledAt: number | null | undefined
): PairingTunnelRouteState {
    const nextRelayRtt = normalizeRtt(roundTripTimeMs) ?? state.relayRoundTripTimeMs
    const relaySampledAt = nextRelayRtt === null ? null : (sampledAt ?? state.relayRoundTripSampledAt)
    if (state.activeRoute === 'direct') {
        return {
            ...state,
            relayAvailable: true,
            relayRoundTripTimeMs: nextRelayRtt,
            relayRoundTripSampledAt: relaySampledAt,
        }
    }

    return promoteRoute(
        { ...state, relayAvailable: true, relayRoundTripTimeMs: nextRelayRtt, relayRoundTripSampledAt: relaySampledAt },
        'relay',
        transport,
        nextRelayRtt,
        relaySampledAt
    )
}

function handleRelayLost(state: PairingTunnelRouteState): PairingTunnelRouteState {
    if (state.activeRoute === 'direct') {
        return { ...state, relayAvailable: false }
    }

    return {
        ...state,
        phase: 'reconnecting',
        activeRoute: null,
        activeTransport: null,
        relayAvailable: false,
        roundTripTimeMs: null,
        roundTripSampledAt: null,
    }
}

function handleDirectCandidate(
    state: PairingTunnelRouteState,
    candidateType: PairingTunnelCandidateType,
    roundTripTimeMs: number | null,
    sampledAt: number | null | undefined,
    options: PairingTunnelRouteOptions
): PairingTunnelRouteState {
    const withCandidate = {
        ...state,
        directCandidateType: candidateType,
        directProbeRoundTripTimeMs: roundTripTimeMs ?? state.directProbeRoundTripTimeMs,
        directProbeSampledAt:
            (roundTripTimeMs ?? state.directProbeRoundTripTimeMs) === null
                ? null
                : (sampledAt ?? state.directProbeSampledAt),
    }
    const probing = { ...withCandidate, directProbe: 'probing' as const }
    return candidateType === 'relay' ? maybePromoteWebRtcRelay(probing, options) : maybePromoteDirect(probing, options)
}

function handleHeartbeatAck(
    state: PairingTunnelRouteState,
    route: PairingTunnelRoute,
    roundTripTimeMs: number | null,
    sampledAt: number | null | undefined,
    options: PairingTunnelRouteOptions
): PairingTunnelRouteState {
    if (route === 'relay') {
        const relayRoundTripTimeMs = roundTripTimeMs ?? state.relayRoundTripTimeMs
        const relayRoundTripSampledAt =
            relayRoundTripTimeMs === null ? null : (sampledAt ?? state.relayRoundTripSampledAt)
        if (state.activeRoute !== 'relay') return { ...state, relayRoundTripTimeMs, relayRoundTripSampledAt }
        return {
            ...state,
            missedAcks: 0,
            roundTripTimeMs: relayRoundTripTimeMs,
            roundTripSampledAt: relayRoundTripSampledAt,
            relayRoundTripTimeMs,
            relayRoundTripSampledAt,
        }
    }

    const directAckCount = state.activeRoute === 'direct' ? state.directAckCount : state.directAckCount + 1
    const directProbeRoundTripTimeMs = roundTripTimeMs ?? state.directProbeRoundTripTimeMs
    const directProbeSampledAt = directProbeRoundTripTimeMs === null ? null : (sampledAt ?? state.directProbeSampledAt)
    const next = { ...state, directAckCount, directProbeRoundTripTimeMs, directProbeSampledAt, missedAcks: 0 }
    if (state.activeRoute === 'direct') {
        if (state.activeTransport === 'turn-webrtc') return maybePromoteWebRtcRelay(next, options)
        return { ...next, roundTripTimeMs: directProbeRoundTripTimeMs, roundTripSampledAt: directProbeSampledAt }
    }
    return state.directCandidateType === 'relay'
        ? maybePromoteWebRtcRelay(next, options)
        : maybePromoteDirect(next, options)
}

function handleHeartbeatMissed(
    state: PairingTunnelRouteState,
    route: PairingTunnelRoute,
    options: PairingTunnelRouteOptions
): PairingTunnelRouteState {
    if (route !== state.activeRoute) return state

    const missedAcks = state.missedAcks + 1
    if (missedAcks < options.missedAckLimit) {
        return { ...state, missedAcks }
    }

    return state.activeRoute === 'direct'
        ? demoteDirect({
              ...state,
              directProbe: 'failed',
              directProbeFailures: state.directProbeFailures + 1,
              directBlockedReason: 'heartbeat-missed',
              missedAcks,
          })
        : handleRelayLost(state)
}

function maybePromoteDirect(
    state: PairingTunnelRouteState,
    options: PairingTunnelRouteOptions
): PairingTunnelRouteState {
    if (!state.directCandidateType || state.directCandidateType === 'relay') return state
    if (state.directAckCount < requiredDirectAckCount(state, options)) {
        return { ...state, directBlockedReason: 'missing-ack' }
    }
    if (!directHasUsefulRttBenefit(state, options)) {
        return { ...state, directBlockedReason: 'direct-slower-than-relay' }
    }
    return promoteRoute(
        { ...state, directProbe: 'usable', directBlockedReason: null },
        'direct',
        'direct-webrtc',
        state.directProbeRoundTripTimeMs,
        state.directProbeSampledAt
    )
}

function maybePromoteWebRtcRelay(
    state: PairingTunnelRouteState,
    options: PairingTunnelRouteOptions
): PairingTunnelRouteState {
    if (state.directCandidateType !== 'relay') return state
    if (state.directAckCount < requiredDirectAckCount(state, options)) {
        return { ...state, directBlockedReason: 'missing-ack' }
    }
    if (!turnHasUsefulRtt(state, options)) {
        const blocked = { ...state, directBlockedReason: 'direct-slower-than-relay' as const }
        return state.activeTransport === 'relay-wss' ? blocked : demoteDirect(blocked)
    }
    return promoteRoute(
        { ...state, directProbe: 'usable', directBlockedReason: 'turn-candidate' },
        'direct',
        'turn-webrtc',
        state.directProbeRoundTripTimeMs,
        state.directProbeSampledAt
    )
}

function demoteDirect(state: PairingTunnelRouteState): PairingTunnelRouteState {
    if (state.activeRoute !== 'direct') return state

    if (state.relayAvailable) {
        return promoteRoute(
            { ...state, directAckCount: 0, directProbeRoundTripTimeMs: null },
            'relay',
            DEFAULT_RELAY_TRANSPORT,
            state.relayRoundTripTimeMs,
            state.relayRoundTripSampledAt
        )
    }

    return {
        ...state,
        phase: 'reconnecting',
        activeRoute: null,
        activeTransport: null,
        directAckCount: 0,
        directProbeRoundTripTimeMs: null,
        roundTripTimeMs: null,
        roundTripSampledAt: null,
    }
}

function requiredDirectAckCount(state: PairingTunnelRouteState, options: PairingTunnelRouteOptions): number {
    const failureAdjusted = options.minDirectAcks + state.directProbeFailures
    return Math.min(Math.max(options.minDirectAcks, failureAdjusted), options.maxDirectAcksAfterFailure)
}

function directHasUsefulRttBenefit(state: PairingTunnelRouteState, options: PairingTunnelRouteOptions): boolean {
    if (state.activeRoute !== 'relay') return true
    if (state.relayRoundTripTimeMs === null || state.directProbeRoundTripTimeMs === null) return true
    return state.directProbeRoundTripTimeMs <= state.relayRoundTripTimeMs + options.maxDirectPenaltyMs
}

function turnHasUsefulRtt(state: PairingTunnelRouteState, options: PairingTunnelRouteOptions): boolean {
    if (!state.relayAvailable) return true
    if (state.relayRoundTripTimeMs === null || state.directProbeRoundTripTimeMs === null) return true
    return state.directProbeRoundTripTimeMs <= state.relayRoundTripTimeMs + options.maxTurnPenaltyMs
}

function promoteRoute(
    state: PairingTunnelRouteState,
    route: PairingTunnelRoute,
    transport: PairingTunnelTransport,
    roundTripTimeMs: number | null,
    sampledAt: number | null
): PairingTunnelRouteState {
    const transportChanged = state.activeTransport !== null && state.activeTransport !== transport
    const routeSwitches = transportChanged ? state.routeSwitches + 1 : state.routeSwitches
    return {
        ...state,
        phase: 'ready',
        activeRoute: route,
        activeTransport: transport,
        missedAcks: 0,
        routeSwitches,
        routeRevision: transportChanged ? state.routeRevision + 1 : state.routeRevision,
        roundTripTimeMs,
        roundTripSampledAt: sampledAt,
    }
}

function normalizeRtt(value: number | null | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null
}

export function resolvePairingTunnelDirectCandidateType(input: {
    localCandidateType?: string | null
    remoteCandidateType?: string | null
    transport: PairingTunnelObservedTransport
}): PairingTunnelCandidateType | null {
    if (input.transport === 'relay') return 'relay'
    if (input.transport !== 'direct') return null
    return (
        normalizeCandidateType(input.localCandidateType) ?? normalizeCandidateType(input.remoteCandidateType) ?? 'srflx'
    )
}

function normalizeCandidateType(value: string | null | undefined): PairingTunnelCandidateType | null {
    return value === 'host' || value === 'srflx' || value === 'prflx' || value === 'relay' ? value : null
}
