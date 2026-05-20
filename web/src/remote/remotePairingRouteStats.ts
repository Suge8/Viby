import type { PairingTransportHandle, PairingTunnelRouteEvent, PairingTunnelRouteState } from '@viby/protocol/pairing'
import {
    PAIRING_LINK_SAMPLE_STALE_MS,
    readPairingTunnelTelemetry,
    resolvePairingTunnelDirectCandidateType,
} from '@viby/protocol/pairing'
import { readRemotePeerTransportStats } from './remotePairingStats'

function freshTelemetryRoundTrip(telemetry: ReturnType<typeof readPairingTunnelTelemetry>): number | null {
    return telemetry.roundTripSampledAt ? telemetry.roundTripTimeMs : null
}

export async function readRemotePairingRouteStats(
    routeState: PairingTunnelRouteState,
    transport: PairingTransportHandle
) {
    const telemetry = readPairingTunnelTelemetry(routeState)
    const sampledAt = Date.now()
    if (telemetry.activeTransport === 'relay-wss') {
        return {
            transport: 'relay' as const,
            transportMode: 'relay-wss' as const,
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: freshTelemetryRoundTrip(telemetry),
            previousTransport: null,
            sampledAt: telemetry.roundTripSampledAt ?? sampledAt,
            staleAfterMs: PAIRING_LINK_SAMPLE_STALE_MS,
            routeRevision: telemetry.routeRevision,
            directBlockedReason: telemetry.directBlockedReason,
        }
    }
    const stats = await readRemotePeerTransportStats(transport.getPeer() as unknown as RTCPeerConnection, sampledAt)
    const previousTransport =
        stats.transport === 'unknown' && telemetry.activeTransport === 'direct-webrtc'
            ? 'direct'
            : stats.transport === 'unknown' && telemetry.activeTransport === 'turn-webrtc'
              ? 'relay'
              : stats.previousTransport
    return {
        ...stats,
        previousTransport,
        routeRevision: telemetry.routeRevision,
        directBlockedReason: telemetry.directBlockedReason,
    }
}

export async function readRemotePairingDirectCandidateEvent(
    transport: PairingTransportHandle
): Promise<PairingTunnelRouteEvent | null> {
    const stats = await readRemotePeerTransportStats(transport.getPeer() as unknown as RTCPeerConnection)
    const candidateType = resolvePairingTunnelDirectCandidateType(stats)
    if (!candidateType) return null
    return {
        type: 'direct-candidate-selected',
        candidateType,
        roundTripTimeMs: stats.currentRoundTripTimeMs,
        sampledAt: stats.sampledAt,
    }
}
