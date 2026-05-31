import type { PairingStatsLike, PairingStatsReportLike } from '../../../../shared/src/pairing/pairingStats'

export type StatsFixtureKind = 'chromium-direct' | 'webkit-direct' | 'relay-selected' | 'empty'

export function createStatsReport(stats: PairingStatsLike[]): PairingStatsReportLike {
    const byId = new Map<string, PairingStatsLike>()
    for (const stat of stats) {
        if (stat.id) byId.set(stat.id, stat)
    }
    return {
        get: (id) => byId.get(id),
        forEach: (callback) => {
            for (const stat of stats) callback(stat)
        },
    }
}

export function chromiumDirectStatsFixture(): PairingStatsReportLike {
    return createStatsReport([
        { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair-direct' },
        {
            id: 'pair-direct',
            type: 'candidate-pair',
            nominated: true,
            state: 'succeeded',
            localCandidateId: 'local-host',
            remoteCandidateId: 'remote-srflx',
            currentRoundTripTime: 0.034,
        },
        { id: 'local-host', type: 'local-candidate', candidateType: 'host' },
        { id: 'remote-srflx', type: 'remote-candidate', candidateType: 'srflx' },
    ])
}

export function webkitDirectStatsFixture(): PairingStatsReportLike {
    return createStatsReport([
        { id: 'transport', type: 'transport', selectedCandidatePairId: 'webkit-pair' },
        {
            id: 'webkit-pair',
            type: 'candidate-pair',
            state: 'succeeded',
            localCandidateId: 'webkit-local',
            remoteCandidateId: 'webkit-remote',
        },
        { id: 'webkit-local', type: 'local-candidate', candidateType: 'srflx' },
        { id: 'webkit-remote', type: 'remote-candidate', candidateType: 'host' },
    ])
}

export function relaySelectedStatsFixture(): PairingStatsReportLike {
    return createStatsReport([
        { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair-relay' },
        {
            id: 'pair-relay',
            type: 'candidate-pair',
            nominated: true,
            state: 'succeeded',
            localCandidateId: 'local-relay',
            remoteCandidateId: 'remote-relay',
            currentRoundTripTime: 0.19,
        },
        { id: 'local-relay', type: 'local-candidate', candidateType: 'relay' },
        { id: 'remote-relay', type: 'remote-candidate', candidateType: 'relay' },
    ])
}

export function emptyStatsFixture(): PairingStatsReportLike {
    return createStatsReport([])
}

export function statsFixture(kind: StatsFixtureKind): PairingStatsReportLike {
    if (kind === 'chromium-direct') return chromiumDirectStatsFixture()
    if (kind === 'webkit-direct') return webkitDirectStatsFixture()
    if (kind === 'relay-selected') return relaySelectedStatsFixture()
    return emptyStatsFixture()
}
