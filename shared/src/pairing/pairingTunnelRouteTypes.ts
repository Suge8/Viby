import type {
    PairingTunnelCandidateType,
    PairingTunnelDirectBlockedReason,
    PairingTunnelRoute,
    PairingTunnelTransport,
} from './pairingTunnelFrame'

export type PairingTunnelRelayTransport = Extract<PairingTunnelTransport, 'relay-wss'>
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
    roundTripSampledAt: number | null
    relayRoundTripTimeMs: number | null
    relayRoundTripSampledAt: number | null
    directProbeRoundTripTimeMs: number | null
    directProbeSampledAt: number | null
    missedAcks: number
    routeSwitches: number
    routeRevision: number
    directProbeFailures: number
    directAckCount: number
    directBlockedReason: PairingTunnelDirectBlockedReason | null
    fatalReason: string | null
}

export type PairingTunnelRouteEvent =
    | {
          type: 'relay-ready'
          transport?: PairingTunnelRelayTransport
          roundTripTimeMs?: number | null
          sampledAt?: number | null
      }
    | { type: 'relay-lost' }
    | { type: 'foreground-check' }
    | { type: 'direct-probe-started' }
    | {
          type: 'direct-candidate-selected'
          candidateType: PairingTunnelCandidateType
          roundTripTimeMs?: number | null
          sampledAt?: number | null
      }
    | { type: 'direct-failed'; reason?: string }
    | { type: 'heartbeat-ack'; route: PairingTunnelRoute; roundTripTimeMs?: number | null; sampledAt?: number | null }
    | { type: 'heartbeat-missed'; route: PairingTunnelRoute }
    | { type: 'fatal'; reason: string }

export interface PairingTunnelRouteOptions {
    minDirectAcks: number
    maxDirectAcksAfterFailure: number
    missedAckLimit: number
}

export const DEFAULT_PAIRING_TUNNEL_ROUTE_OPTIONS: PairingTunnelRouteOptions = {
    minDirectAcks: 2,
    maxDirectAcksAfterFailure: 4,
    missedAckLimit: 2,
}

export function createPairingTunnelRouteState(): PairingTunnelRouteState {
    return {
        phase: 'connecting',
        activeRoute: null,
        activeTransport: null,
        relayAvailable: false,
        directProbe: 'idle',
        directCandidateType: null,
        roundTripTimeMs: null,
        roundTripSampledAt: null,
        relayRoundTripTimeMs: null,
        relayRoundTripSampledAt: null,
        directProbeRoundTripTimeMs: null,
        directProbeSampledAt: null,
        missedAcks: 0,
        routeSwitches: 0,
        routeRevision: 0,
        directProbeFailures: 0,
        directAckCount: 0,
        directBlockedReason: null,
        fatalReason: null,
    }
}
