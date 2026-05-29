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
            directProbe: telemetry.directProbe,
        }
    }
    const stats = await readRemotePeerTransportStats(transport.getPeer() as unknown as RTCPeerConnection, sampledAt)
    if (telemetry.activeTransport === 'direct-webrtc') return mergeDirectTelemetry(stats, telemetry, sampledAt)
    return {
        ...stats,
        routeRevision: telemetry.routeRevision,
        directBlockedReason: telemetry.directBlockedReason,
        directProbe: telemetry.directProbe,
    }
}

function mergeDirectTelemetry(
    stats: Awaited<ReturnType<typeof readRemotePeerTransportStats>>,
    telemetry: ReturnType<typeof readPairingTunnelTelemetry>,
    sampledAt: number
) {
    const telemetryRtt = freshTelemetryRoundTrip(telemetry)
    const telemetrySampledAt = telemetry.roundTripSampledAt ?? sampledAt
    if (stats.transport === 'direct') {
        return {
            ...stats,
            currentRoundTripTimeMs: stats.currentRoundTripTimeMs ?? telemetryRtt,
            sampledAt: stats.currentRoundTripTimeMs === null ? telemetrySampledAt : stats.sampledAt,
            routeRevision: telemetry.routeRevision,
            directBlockedReason: telemetry.directBlockedReason,
            directProbe: telemetry.directProbe,
        }
    }
    return {
        transport: 'direct' as const,
        transportMode: 'direct-webrtc' as const,
        localCandidateType: telemetry.directCandidateType,
        remoteCandidateType: null,
        currentRoundTripTimeMs: telemetryRtt,
        previousTransport: null,
        sampledAt: telemetrySampledAt,
        staleAfterMs: PAIRING_LINK_SAMPLE_STALE_MS,
        routeRevision: telemetry.routeRevision,
        directBlockedReason: telemetry.directBlockedReason,
        directProbe: telemetry.directProbe,
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
