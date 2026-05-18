import type {
    PairingTunnelCandidateType,
    PairingTunnelRoute,
    PairingTunnelTelemetry,
    PairingTunnelTransport,
} from './pairingTunnelFrame'

type PairingTunnelRelayTransport = Extract<PairingTunnelTransport, 'relay-wss'>

export type PairingTunnelRoutePhase = 'connecting' | 'ready' | 'reconnecting' | 'fatal'
export type PairingTunnelDirectProbe = 'idle' | 'probing' | 'usable' | 'failed'
export type PairingTunnelObservedTransport = 'direct' | 'relay' | 'unknown'

export interface PairingTunnelRouteState {
    phase: PairingTunnelRoutePhase
    activeRoute: PairingTunnelRoute | null
    activeTransport: PairingTunnelTransport | null
    relayAvailable: boolean
    directProbe: PairingTunnelDirectProbe
    directCandidateType: PairingTunnelCandidateType | null
    roundTripTimeMs: number | null
    relayRoundTripTimeMs: number | null
    directProbeRoundTripTimeMs: number | null
    missedAcks: number
    routeSwitches: number
    directProbeFailures: number
    directAckCount: number
    fatalReason: string | null
}

export type PairingTunnelRouteEvent =
    | { type: 'relay-ready'; transport?: PairingTunnelRelayTransport; roundTripTimeMs?: number | null }
    | { type: 'relay-lost' }
    | { type: 'direct-probe-started' }
    | { type: 'direct-candidate-selected'; candidateType: PairingTunnelCandidateType; roundTripTimeMs?: number | null }
    | { type: 'direct-failed'; reason?: string }
    | { type: 'heartbeat-ack'; route: PairingTunnelRoute; roundTripTimeMs?: number | null }
    | { type: 'heartbeat-missed'; route: PairingTunnelRoute }
    | { type: 'fatal'; reason: string }

export interface PairingTunnelRouteOptions {
    minDirectAcks: number
    maxDirectAcksAfterFailure: number
    minDirectRttBenefitMs: number
    missedAckLimit: number
}

export const DEFAULT_PAIRING_TUNNEL_ROUTE_OPTIONS: PairingTunnelRouteOptions = {
    minDirectAcks: 2,
    maxDirectAcksAfterFailure: 4,
    minDirectRttBenefitMs: 15,
    missedAckLimit: 2,
}

const DEFAULT_RELAY_TRANSPORT: PairingTunnelRelayTransport = 'relay-wss'

export function createPairingTunnelRouteState(): PairingTunnelRouteState {
    return {
        phase: 'connecting',
        activeRoute: null,
        activeTransport: null,
        relayAvailable: false,
        directProbe: 'idle',
        directCandidateType: null,
        roundTripTimeMs: null,
        relayRoundTripTimeMs: null,
        directProbeRoundTripTimeMs: null,
        missedAcks: 0,
        routeSwitches: 0,
        directProbeFailures: 0,
        directAckCount: 0,
        fatalReason: null,
    }
}

export function reducePairingTunnelRoute(
    state: PairingTunnelRouteState,
    event: PairingTunnelRouteEvent,
    options: PairingTunnelRouteOptions = DEFAULT_PAIRING_TUNNEL_ROUTE_OPTIONS
): PairingTunnelRouteState {
    if (state.phase === 'fatal') return state

    switch (event.type) {
        case 'relay-ready':
            return handleRelayReady(state, event.transport ?? DEFAULT_RELAY_TRANSPORT, event.roundTripTimeMs)
        case 'relay-lost':
            return handleRelayLost(state)
        case 'direct-probe-started':
            return {
                ...state,
                directProbe: 'probing',
                directCandidateType: null,
                directProbeRoundTripTimeMs: null,
                directAckCount: 0,
            }
        case 'direct-candidate-selected':
            return handleDirectCandidate(state, event.candidateType, normalizeRtt(event.roundTripTimeMs), options)
        case 'direct-failed':
            return demoteDirect({ ...state, directProbe: 'failed', directProbeFailures: state.directProbeFailures + 1 })
        case 'heartbeat-ack':
            return handleHeartbeatAck(state, event.route, normalizeRtt(event.roundTripTimeMs), options)
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
        missedAcks: state.missedAcks,
        routeSwitches: state.routeSwitches,
        directProbeFailures: state.directProbeFailures,
    }
}

export function shouldReprobePairingDirect(state: PairingTunnelRouteState): boolean {
    return state.activeRoute === 'relay' && state.directProbe !== 'probing'
}

function handleRelayReady(
    state: PairingTunnelRouteState,
    transport: PairingTunnelRelayTransport,
    roundTripTimeMs: number | null | undefined
): PairingTunnelRouteState {
    const nextRelayRtt = normalizeRtt(roundTripTimeMs) ?? state.relayRoundTripTimeMs
    if (state.activeRoute === 'direct') {
        return { ...state, relayAvailable: true, relayRoundTripTimeMs: nextRelayRtt }
    }

    return promoteRoute(
        { ...state, relayAvailable: true, relayRoundTripTimeMs: nextRelayRtt },
        'relay',
        transport,
        nextRelayRtt
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
    }
}

function handleDirectCandidate(
    state: PairingTunnelRouteState,
    candidateType: PairingTunnelCandidateType,
    roundTripTimeMs: number | null,
    options: PairingTunnelRouteOptions
): PairingTunnelRouteState {
    const withCandidate = {
        ...state,
        directCandidateType: candidateType,
        directProbeRoundTripTimeMs: roundTripTimeMs ?? state.directProbeRoundTripTimeMs,
    }
    if (candidateType === 'relay') {
        return demoteDirect({
            ...withCandidate,
            directProbe: 'failed',
            directProbeFailures: state.directProbeFailures + 1,
        })
    }

    return maybePromoteDirect({ ...withCandidate, directProbe: 'probing' }, options)
}

function handleHeartbeatAck(
    state: PairingTunnelRouteState,
    route: PairingTunnelRoute,
    roundTripTimeMs: number | null,
    options: PairingTunnelRouteOptions
): PairingTunnelRouteState {
    if (route === 'relay') {
        const relayRoundTripTimeMs = roundTripTimeMs ?? state.relayRoundTripTimeMs
        if (state.activeRoute !== 'relay') return { ...state, relayRoundTripTimeMs }
        return { ...state, missedAcks: 0, roundTripTimeMs: relayRoundTripTimeMs, relayRoundTripTimeMs }
    }

    const directAckCount = state.activeRoute === 'direct' ? state.directAckCount : state.directAckCount + 1
    const directProbeRoundTripTimeMs = roundTripTimeMs ?? state.directProbeRoundTripTimeMs
    const next = { ...state, directAckCount, directProbeRoundTripTimeMs, missedAcks: 0 }
    return state.activeRoute === 'direct'
        ? { ...next, roundTripTimeMs: directProbeRoundTripTimeMs }
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
              missedAcks,
          })
        : handleRelayLost(state)
}

function maybePromoteDirect(
    state: PairingTunnelRouteState,
    options: PairingTunnelRouteOptions
): PairingTunnelRouteState {
    if (!state.directCandidateType || state.directCandidateType === 'relay') return state
    if (state.directAckCount < requiredDirectAckCount(state, options)) return state
    if (!directHasUsefulRttBenefit(state, options)) return state
    return promoteRoute(
        { ...state, directProbe: 'usable' },
        'direct',
        'direct-webrtc',
        state.directProbeRoundTripTimeMs
    )
}

function demoteDirect(state: PairingTunnelRouteState): PairingTunnelRouteState {
    if (state.activeRoute !== 'direct') return state

    if (state.relayAvailable) {
        return promoteRoute(
            { ...state, directAckCount: 0, directProbeRoundTripTimeMs: null },
            'relay',
            DEFAULT_RELAY_TRANSPORT,
            state.relayRoundTripTimeMs
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
    }
}

function requiredDirectAckCount(state: PairingTunnelRouteState, options: PairingTunnelRouteOptions): number {
    const failureAdjusted = options.minDirectAcks + state.directProbeFailures
    return Math.min(Math.max(options.minDirectAcks, failureAdjusted), options.maxDirectAcksAfterFailure)
}

function directHasUsefulRttBenefit(state: PairingTunnelRouteState, options: PairingTunnelRouteOptions): boolean {
    if (state.activeRoute !== 'relay') return true
    if (state.relayRoundTripTimeMs === null || state.directProbeRoundTripTimeMs === null) return true
    return state.directProbeRoundTripTimeMs + options.minDirectRttBenefitMs <= state.relayRoundTripTimeMs
}

function promoteRoute(
    state: PairingTunnelRouteState,
    route: PairingTunnelRoute,
    transport: PairingTunnelTransport,
    roundTripTimeMs: number | null
): PairingTunnelRouteState {
    const routeSwitches =
        state.activeRoute && state.activeRoute !== route ? state.routeSwitches + 1 : state.routeSwitches
    return {
        ...state,
        phase: 'ready',
        activeRoute: route,
        activeTransport: transport,
        missedAcks: 0,
        routeSwitches,
        roundTripTimeMs,
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
