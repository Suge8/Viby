export interface PairingStatsReportLike {
    get(id: string): PairingStatsLike | undefined
    forEach(callback: (stat: PairingStatsLike) => void): void
}

export interface PairingStatsLike {
    id?: string
    type?: string
    selected?: boolean
    nominated?: boolean
    state?: string
    selectedCandidatePairId?: string
    localCandidateId?: string
    remoteCandidateId?: string
    candidateType?: string
    currentRoundTripTime?: number
}

export interface PairingSelectedCandidatePairStats {
    pair: PairingStatsLike
    localCandidateType: string | null
    remoteCandidateType: string | null
}

function findSelectedCandidatePair(report: PairingStatsReportLike): PairingStatsLike | null {
    let fallback: PairingStatsLike | null = null
    for (const stat of readPairingStats(report)) {
        if (stat.type === 'transport' && stat.selectedCandidatePairId) {
            const selected = report.get(stat.selectedCandidatePairId)
            if (selected) return selected
        }
        if (stat.type === 'candidate-pair' && stat.nominated && stat.state === 'succeeded') fallback = stat
    }
    return fallback
}

function readCandidateType(report: PairingStatsReportLike, candidateId: string | undefined): string | null {
    const candidate = candidateId ? report.get(candidateId) : null
    return candidate && typeof candidate.candidateType === 'string' ? candidate.candidateType : null
}

function readPairingStats(report: PairingStatsReportLike): PairingStatsLike[] {
    const stats: PairingStatsLike[] = []
    report.forEach((stat) => stats.push(stat))
    return stats
}

export function resolvePairingSelectedCandidatePairStats(
    report: PairingStatsReportLike
): PairingSelectedCandidatePairStats | null {
    const pair = findSelectedCandidatePair(report)
    if (!pair) return null
    return {
        pair,
        localCandidateType: readCandidateType(report, pair.localCandidateId),
        remoteCandidateType: readCandidateType(report, pair.remoteCandidateId),
    }
}
