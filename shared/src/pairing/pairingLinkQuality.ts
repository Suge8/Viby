export type PairingLinkTransport = 'direct' | 'relay' | 'unknown'
export type PairingLinkTone = 'success' | 'warning' | 'neutral'
export type PairingLinkLatencyTier = 'fast' | 'steady' | 'slow' | 'unknown'

const FAST_RTT_MS = 80
const STEADY_RTT_MS = 180

export interface PairingLinkQualityInput {
    transport: PairingLinkTransport
    currentRoundTripTimeMs: number | null
}

export interface PairingLinkTransportInput {
    transport: PairingLinkTransport
}

export interface PairingLinkCandidateInput {
    localCandidateType: string | null
    remoteCandidateType: string | null
}

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

export interface PairingLinkQuality {
    transport: PairingLinkTransport
    tone: PairingLinkTone
    latencyTier: PairingLinkLatencyTier
    roundTripTimeMs: number | null
}

export interface PairingLinkPresentation {
    title: string
    detail: string
    tone: PairingLinkTone
}

function normalizeRoundTripTime(value: number | null): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null
}

function classifyLatency(roundTripTimeMs: number | null): PairingLinkLatencyTier {
    if (roundTripTimeMs === null) {
        return 'unknown'
    }

    if (roundTripTimeMs <= FAST_RTT_MS) {
        return 'fast'
    }

    return roundTripTimeMs <= STEADY_RTT_MS ? 'steady' : 'slow'
}

function classifyTone(transport: PairingLinkTransport, latencyTier: PairingLinkLatencyTier): PairingLinkTone {
    if (transport === 'direct' && latencyTier !== 'slow') {
        return 'success'
    }

    if (transport === 'unknown') {
        return 'neutral'
    }

    return 'warning'
}

export function classifyPairingLinkQuality(input: PairingLinkQualityInput): PairingLinkQuality {
    const roundTripTimeMs = normalizeRoundTripTime(input.currentRoundTripTimeMs)
    const latencyTier = classifyLatency(roundTripTimeMs)

    return {
        transport: input.transport,
        tone: classifyTone(input.transport, latencyTier),
        latencyTier,
        roundTripTimeMs,
    }
}

export function formatPairingRoundTripTime(roundTripTimeMs: number | null): string | null {
    const normalized = normalizeRoundTripTime(roundTripTimeMs)
    return normalized === null ? null : `${normalized}ms`
}

export function describePairingLinkTransport(input: PairingLinkTransportInput | null | undefined): string {
    if (!input) {
        return '检测链路'
    }

    switch (input.transport) {
        case 'direct':
            return '本机直连'
        case 'relay':
            return '安全中转'
        default:
            return '检测链路'
    }
}

export function resolvePairingLinkTransport(input: PairingLinkCandidateInput): PairingLinkTransport {
    if (input.localCandidateType === 'relay' || input.remoteCandidateType === 'relay') {
        return 'relay'
    }

    if (input.localCandidateType && input.remoteCandidateType) {
        return 'direct'
    }

    return 'unknown'
}

function findSelectedCandidatePair(report: PairingStatsReportLike): PairingStatsLike | null {
    let fallback: PairingStatsLike | null = null

    for (const stat of readPairingStats(report)) {
        if (stat.type === 'transport' && stat.selectedCandidatePairId) {
            const selected = report.get(stat.selectedCandidatePairId)
            if (selected) {
                return selected
            }
        }

        if (stat.type === 'candidate-pair' && stat.nominated && stat.state === 'succeeded') {
            fallback = stat
        }
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

    if (!pair) {
        return null
    }

    return {
        pair,
        localCandidateType: readCandidateType(report, pair.localCandidateId),
        remoteCandidateType: readCandidateType(report, pair.remoteCandidateId),
    }
}

export function buildPairingLinkPresentation(
    input: PairingLinkQualityInput | null | undefined
): PairingLinkPresentation {
    if (!input) {
        return {
            title: '正在检测链路',
            detail: '已连接后会确认是本机直连还是安全中转。',
            tone: 'neutral',
        }
    }

    const quality = classifyPairingLinkQuality(input)
    const latency = formatPairingRoundTripTime(quality.roundTripTimeMs)
    const latencyText = latency ? ` · 延迟 ${latency}` : ''

    if (quality.transport === 'direct') {
        return {
            title: `本机直连${latencyText}`,
            detail: '最快路线。延迟数字越小，手机操作越跟手。',
            tone: quality.tone,
        }
    }

    if (quality.transport === 'relay') {
        return {
            title: `安全中转${latencyText}`,
            detail: '两边网络不能直连时自动绕路；能正常用，不用手动设置。',
            tone: quality.tone,
        }
    }

    return {
        title: '已连接 · 正在检测链路',
        detail: '不影响使用；Viby 正在确认是本机直连还是安全中转。',
        tone: 'neutral',
    }
}
