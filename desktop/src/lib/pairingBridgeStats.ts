import {
    PAIRING_LINK_SAMPLE_STALE_MS,
    type PairingLinkTransport,
    type PairingStatsReportLike,
    resolvePairingLinkTransport,
    resolvePairingSelectedCandidatePairStats,
} from '@viby/protocol/pairing'
import type { PairingBridgeStats } from '@/types'

export function readPairingBridgeStats(
    report: PairingStatsReportLike,
    previousTransport: 'direct' | 'relay' | null = null,
    sampledAt = Date.now()
): PairingBridgeStats {
    const selected = resolvePairingSelectedCandidatePairStats(report)
    const transport = selected ? resolvePairingLinkTransport(selected) : 'unknown'
    return {
        transport,
        transportMode: transport === 'direct' ? 'direct-webrtc' : 'unknown',
        previousTransport: resolvePreviousTransport(transport, previousTransport),
        localCandidateType: selected?.localCandidateType ?? null,
        remoteCandidateType: selected?.remoteCandidateType ?? null,
        currentRoundTripTimeMs:
            typeof selected?.pair.currentRoundTripTime === 'number'
                ? Math.round(selected.pair.currentRoundTripTime * 1000)
                : null,
        sampledAt,
        staleAfterMs: PAIRING_LINK_SAMPLE_STALE_MS,
        routeRevision: 0,
        restartCount: 0,
    }
}

export function startPairingBridgeStats(options: {
    getPeer: () => RTCPeerConnection
    setStats: (stats: PairingBridgeStats | null) => void
    reportError: (message: string, error: unknown) => void
}): { dispose: () => void; sample: () => Promise<PairingBridgeStats | null> } {
    let previousTransport: 'direct' | 'relay' | null = null
    let disposed = false
    return {
        dispose: () => {
            disposed = true
            options.setStats(null)
        },
        sample,
    }

    async function sample(): Promise<PairingBridgeStats | null> {
        if (disposed) return null
        try {
            const stats = readPairingBridgeStats(await options.getPeer().getStats(), previousTransport)
            if (isSettledTransport(stats.transport)) previousTransport = stats.transport
            options.setStats(stats)
            return stats
        } catch (error) {
            options.reportError('配对链路统计采集失败：', error)
            return null
        }
    }
}

function isSettledTransport(transport: PairingLinkTransport): transport is 'direct' | 'relay' {
    return transport === 'direct' || transport === 'relay'
}

function resolvePreviousTransport(
    transport: PairingLinkTransport,
    previousTransport: 'direct' | 'relay' | null
): 'direct' | 'relay' | null {
    if (transport === 'unknown') return previousTransport
    return previousTransport && previousTransport !== transport ? previousTransport : null
}
