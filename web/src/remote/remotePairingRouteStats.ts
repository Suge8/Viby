import type { PairingTransportHandle, PairingTunnelRouteEvent, PairingTunnelRouteState } from '@viby/protocol/pairing'
import { readPairingTunnelTelemetry, resolvePairingTunnelDirectCandidateType } from '@viby/protocol/pairing'
import { readRemotePeerTransportStats } from './remotePairingStats'

export async function readRemotePairingRouteStats(
    routeState: PairingTunnelRouteState,
    transport: PairingTransportHandle
) {
    const telemetry = readPairingTunnelTelemetry(routeState)
    const sampledAt = Date.now()
    if (telemetry.activeRoute === 'relay') {
        return {
            transport: 'relay' as const,
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: telemetry.roundTripTimeMs,
            previousTransport: null,
            sampledAt,
        }
    }
    const stats = await readRemotePeerTransportStats(transport.getPeer() as unknown as RTCPeerConnection, sampledAt)
    return {
        ...stats,
        previousTransport:
            stats.transport === 'unknown' && telemetry.activeRoute === 'direct' ? 'direct' : stats.previousTransport,
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
    }
}
