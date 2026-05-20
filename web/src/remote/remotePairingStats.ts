import {
    PAIRING_LINK_SAMPLE_STALE_MS,
    type PairingTunnelDirectBlockedReason,
    type PairingTunnelTransport,
    resolvePairingLinkTransport,
    resolvePairingSelectedCandidatePairStats,
} from '@viby/protocol/pairing'

export type RemotePeerTransport = 'direct' | 'relay' | 'unknown'

export type RemotePeerTransportStats = {
    transport: RemotePeerTransport
    transportMode: PairingTunnelTransport | 'unknown'
    localCandidateType: string | null
    remoteCandidateType: string | null
    currentRoundTripTimeMs: number | null
    previousTransport?: 'direct' | 'relay' | null
    sampledAt: number
    staleAfterMs: number
    routeRevision: number
    directBlockedReason?: PairingTunnelDirectBlockedReason | null
}

export async function readRemotePeerTransportStats(
    peer: RTCPeerConnection,
    sampledAt = Date.now()
): Promise<RemotePeerTransportStats> {
    const report = await peer.getStats()
    const selected = resolvePairingSelectedCandidatePairStats(report)

    if (!selected) {
        return {
            transport: 'unknown',
            transportMode: 'unknown',
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: null,
            previousTransport: null,
            sampledAt,
            staleAfterMs: PAIRING_LINK_SAMPLE_STALE_MS,
            routeRevision: 0,
        }
    }

    const transport = resolvePairingLinkTransport(selected)
    return {
        transport,
        transportMode: transport === 'direct' ? 'direct-webrtc' : transport === 'relay' ? 'turn-webrtc' : 'unknown',
        localCandidateType: selected.localCandidateType,
        remoteCandidateType: selected.remoteCandidateType,
        currentRoundTripTimeMs:
            typeof selected.pair.currentRoundTripTime === 'number'
                ? Math.round(selected.pair.currentRoundTripTime * 1000)
                : null,
        previousTransport: null,
        sampledAt,
        staleAfterMs: PAIRING_LINK_SAMPLE_STALE_MS,
        routeRevision: 0,
    }
}
