import { resolvePairingLinkTransport, resolvePairingSelectedCandidatePairStats } from '@viby/protocol/pairing'

export type RemotePeerTransport = 'direct' | 'relay' | 'unknown'

export type RemotePeerTransportStats = {
    transport: RemotePeerTransport
    localCandidateType: string | null
    remoteCandidateType: string | null
    currentRoundTripTimeMs: number | null
}

export async function readRemotePeerTransportStats(peer: RTCPeerConnection): Promise<RemotePeerTransportStats> {
    const report = await peer.getStats()
    const selected = resolvePairingSelectedCandidatePairStats(report)

    if (!selected) {
        return {
            transport: 'unknown',
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: null,
        }
    }

    return {
        transport: resolvePairingLinkTransport(selected),
        localCandidateType: selected.localCandidateType,
        remoteCandidateType: selected.remoteCandidateType,
        currentRoundTripTimeMs:
            typeof selected.pair.currentRoundTripTime === 'number'
                ? Math.round(selected.pair.currentRoundTripTime * 1000)
                : null,
    }
}
