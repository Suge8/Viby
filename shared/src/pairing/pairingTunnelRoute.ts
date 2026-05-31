import type {
    PairingTunnelCandidateType,
    PairingTunnelDirectBlockedReason,
    PairingTunnelRoute,
    PairingTunnelTelemetry,
    PairingTunnelTransport,
} from './pairingTunnelFrame'
import {
    createPairingTunnelRouteState,
    DEFAULT_PAIRING_TUNNEL_ROUTE_OPTIONS,
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
        case 'foreground-check':
            return state.phase === 'ready' ? { ...state, missedAcks: 0 } : state
        case 'direct-probe-started':
            return {
                ...state,
                routeGeneration: event.routeGeneration ?? state.routeGeneration + 1,
                directProbe: 'probing',
                directCandidateType: null,
                directProbeRoundTripTimeMs: null,
                directProbeSampledAt: null,
                directAckCount: 0,
                directBlockedReason: 'missing-ack',
            }
        case 'direct-candidate-selected':
            if (isStaleDirectGeneration(state, event.routeGeneration)) return state
            return handleDirectCandidate(
                state,
                event.candidateType,
                normalizeRtt(event.roundTripTimeMs),
                event.sampledAt,
                options
            )
        case 'direct-failed':
            if (isStaleDirectGeneration(state, event.routeGeneration)) return state
            return demoteDirect({
                ...state,
                directProbe: 'failed',
                directProbeFailures: state.directProbeFailures + 1,
                directBlockedReason: normalizeDirectFailureReason(event.reason),
            })
        case 'heartbeat-ack':
            if (event.route === 'direct' && isStaleDirectGeneration(state, event.routeGeneration)) return state
            return handleHeartbeatAck(state, event.route, normalizeRtt(event.roundTripTimeMs), event.sampledAt, options)
        case 'heartbeat-missed':
            if (event.route === 'direct' && isStaleDirectGeneration(state, event.routeGeneration)) return state
            return handleHeartbeatMissed(state, event.route, options)
        case 'fatal':
            return { ...state, phase: 'fatal', fatalReason: event.reason }
    }
}

function isStaleDirectGeneration(state: PairingTunnelRouteState, routeGeneration: number | undefined): boolean {
    return routeGeneration !== undefined && routeGeneration !== state.routeGeneration
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
    return state.activeTransport === 'relay-wss' && state.directProbe !== 'probing'
}

export function shouldRequestPairingDirectProbeAck(state: PairingTunnelRouteState): boolean {
    return (
        state.activeRoute !== 'direct' && state.directProbe === 'probing' && state.directBlockedReason === 'missing-ack'
    )
}

function normalizeDirectFailureReason(reason: string | undefined): PairingTunnelDirectBlockedReason {
    return reason === 'peer-replaced' ? 'peer-replaced' : 'ice-failed'
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

    return clearActiveRoute(state, { relayAvailable: false })
}

function clearActiveRoute(
    state: PairingTunnelRouteState,
    overrides: Partial<PairingTunnelRouteState> = {}
): PairingTunnelRouteState {
    return {
        ...state,
        phase: 'reconnecting',
        activeRoute: null,
        activeTransport: null,
        roundTripTimeMs: null,
        roundTripSampledAt: null,
        ...overrides,
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
    return candidateType === 'relay' ? rejectRelayCandidate(probing) : maybePromoteDirect(probing, options)
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
        if (state.activeRoute === null) {
            return promoteRoute(
                { ...state, relayAvailable: true, relayRoundTripTimeMs, relayRoundTripSampledAt },
                'relay',
                'relay-wss',
                relayRoundTripTimeMs,
                relayRoundTripSampledAt
            )
        }
        if (state.activeRoute !== 'relay') {
            return { ...state, relayAvailable: true, relayRoundTripTimeMs, relayRoundTripSampledAt }
        }
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
        return { ...next, roundTripTimeMs: directProbeRoundTripTimeMs, roundTripSampledAt: directProbeSampledAt }
    }
    return state.directCandidateType === 'relay' ? rejectRelayCandidate(next) : maybePromoteDirect(next, options)
}

function handleHeartbeatMissed(
    state: PairingTunnelRouteState,
    route: PairingTunnelRoute,
    options: PairingTunnelRouteOptions
): PairingTunnelRouteState {
    if (route !== state.activeRoute) {
        return route === 'direct' && state.directProbe === 'probing'
            ? {
                  ...state,
                  directProbe: 'failed',
                  directProbeFailures: state.directProbeFailures + 1,
                  directAckCount: 0,
                  directProbeRoundTripTimeMs: null,
                  directProbeSampledAt: null,
                  directBlockedReason: 'heartbeat-missed',
              }
            : state
    }

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
    if (state.directCandidateType === 'relay') return state
    if (state.directAckCount < requiredDirectAckCount(state, options)) {
        return { ...state, directBlockedReason: 'missing-ack' }
    }
    return promoteRoute(
        { ...state, directProbe: 'usable', directBlockedReason: null },
        'direct',
        'direct-webrtc',
        state.directProbeRoundTripTimeMs,
        state.directProbeSampledAt
    )
}

function rejectRelayCandidate(state: PairingTunnelRouteState): PairingTunnelRouteState {
    if (state.directCandidateType !== 'relay') return state
    const blocked = { ...state, directProbe: 'failed' as const, directBlockedReason: 'turn-candidate' as const }
    return state.activeRoute === 'direct' ? demoteDirect(blocked) : blocked
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
