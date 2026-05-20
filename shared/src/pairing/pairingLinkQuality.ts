import { PAIRING_LINK_SAMPLE_STALE_MS } from './pairingTiming'

export type PairingLinkTransport = 'direct' | 'relay' | 'unknown'
export type PairingLinkTone = 'success' | 'warning' | 'neutral'
export type PairingDeviceLinkTone = PairingLinkTone | 'danger'
export type PairingLinkLatencyTier = 'fast' | 'steady' | 'slow' | 'unknown'
export type PairingDeviceChannel = 'local' | 'link' | 'scan'
export type PairingDeviceLinkBridgePhase = 'connecting' | 'ready' | 'fatal'
export type PairingDeviceLinkPhase =
    | 'direct'
    | 'relay'
    | 'measuring'
    | 'handshaking'
    | 'paused'
    | 'failed'
    | 'lan'
    | 'local'
    | 'public'
    | 'unknown'

const FAST_RTT_MS = 80
const STEADY_RTT_MS = 180

export interface PairingLinkQualityInput {
    transport: PairingLinkTransport
    currentRoundTripTimeMs: number | null
    directBlockedReason?: string | null
    sampledAt?: number | null
    staleAfterMs?: number | null
    /**
     * Last confirmed transport (direct/relay). When the current transport is
     * `unknown` mid-renegotiation, the UI uses this to label direction.
     */
    previousTransport?: 'direct' | 'relay' | null
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

export interface PairingDeviceLinkBridgeInput {
    phase: PairingDeviceLinkBridgePhase
    stats: PairingLinkQualityInput | null
}

export interface PairingDeviceLinkInput {
    channel: PairingDeviceChannel | null
    active: boolean
    bridge: PairingDeviceLinkBridgeInput | null
}

export interface PairingDeviceLinkStatus {
    phase: PairingDeviceLinkPhase
    title: string
    tone: PairingDeviceLinkTone
    latencyMs: number | null
}

function normalizeRoundTripTime(value: number | null): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null
}

export function isPairingLinkSampleFresh(
    sampledAt: number | null | undefined,
    now = Date.now(),
    staleAfterMs = PAIRING_LINK_SAMPLE_STALE_MS
): boolean {
    return typeof sampledAt === 'number' && now - sampledAt <= staleAfterMs
}

function normalizeFreshRoundTripTime(input: PairingLinkQualityInput): number | null {
    const roundTripTimeMs = normalizeRoundTripTime(input.currentRoundTripTimeMs)
    if (roundTripTimeMs === null) return null
    return isPairingLinkSampleFresh(input.sampledAt, Date.now(), input.staleAfterMs ?? PAIRING_LINK_SAMPLE_STALE_MS)
        ? roundTripTimeMs
        : null
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
    const roundTripTimeMs = normalizeFreshRoundTripTime(input)
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
            return '点对点直连'
        case 'relay':
            return '安全中转'
        default:
            return '检测链路'
    }
}

export function describePairingDirectBlockedReason(reason: string | null | undefined): string | null {
    switch (reason) {
        case 'turn-candidate':
            return '网络只能选到 TURN 中转'
        case 'missing-ack':
            return '直连探测还在确认心跳'
        case 'direct-slower-than-relay':
            return 'WebRTC 路径比当前中转慢'
        case 'ice-failed':
            return '直连 ICE 失败'
        case 'heartbeat-missed':
            return '直连心跳丢失'
        default:
            return null
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

function buildReadyDeviceLinkStatus(stats: PairingLinkQualityInput | null): PairingDeviceLinkStatus {
    if (!stats) {
        return { phase: 'measuring', title: '已连接', tone: 'success', latencyMs: null }
    }

    if (stats.transport === 'unknown' && stats.previousTransport) {
        return stats.previousTransport === 'direct'
            ? { phase: 'handshaking', title: '正在重选点对点路径', tone: 'neutral', latencyMs: null }
            : { phase: 'handshaking', title: '正在尝试升级至点对点直连', tone: 'neutral', latencyMs: null }
    }

    const quality = classifyPairingLinkQuality(stats)
    const latency = formatPairingRoundTripTime(quality.roundTripTimeMs)

    if (quality.transport === 'direct') {
        return {
            phase: 'direct',
            title: latency ? `点对点直连 · ${latency}` : '点对点直连',
            tone: quality.tone,
            latencyMs: quality.roundTripTimeMs,
        }
    }

    if (quality.transport === 'relay') {
        return {
            phase: 'relay',
            title: latency ? `安全中转 · ${latency}` : '安全中转',
            tone: quality.tone,
            latencyMs: quality.roundTripTimeMs,
        }
    }

    return { phase: 'measuring', title: '已连接', tone: 'success', latencyMs: null }
}

function buildLiveDeviceLinkStatus(bridge: PairingDeviceLinkBridgeInput): PairingDeviceLinkStatus | null {
    switch (bridge.phase) {
        case 'ready':
            return buildReadyDeviceLinkStatus(bridge.stats)
        case 'connecting':
            return { phase: 'handshaking', title: '正在握手', tone: 'neutral', latencyMs: null }
        case 'fatal':
            return { phase: 'failed', title: '链路异常', tone: 'danger', latencyMs: null }
    }
}

function buildChannelDeviceLinkStatus(channel: PairingDeviceChannel | null, active: boolean): PairingDeviceLinkStatus {
    if (channel === 'local') {
        return { phase: 'local', title: '本机', tone: 'neutral', latencyMs: null }
    }

    if (channel === 'link') {
        return { phase: 'lan', title: '局域网', tone: active ? 'success' : 'neutral', latencyMs: null }
    }

    if (channel === 'scan') {
        return { phase: 'public', title: '公网', tone: active ? 'success' : 'neutral', latencyMs: null }
    }

    return { phase: 'unknown', title: active ? '已连接' : '已离线', tone: 'neutral', latencyMs: null }
}

export function buildPairingDeviceLinkStatus(input: PairingDeviceLinkInput): PairingDeviceLinkStatus {
    if (input.bridge) {
        const live = buildLiveDeviceLinkStatus(input.bridge)
        if (live) return live
    }
    return buildChannelDeviceLinkStatus(input.channel, input.active)
}

export function buildPairingLinkPresentation(
    input: PairingLinkQualityInput | null | undefined
): PairingLinkPresentation {
    if (!input) {
        return {
            title: '正在检测链路',
            detail: '已连接后会确认是点对点直连还是安全中转。',
            tone: 'neutral',
        }
    }

    const quality = classifyPairingLinkQuality(input)
    const latency = formatPairingRoundTripTime(quality.roundTripTimeMs)
    const latencyText = latency ? ` · 延迟 ${latency}` : ''

    if (quality.transport === 'direct') {
        return {
            title: `点对点直连${latencyText}`,
            detail: '最快路线。延迟数字越小，设备操作越跟手。',
            tone: quality.tone,
        }
    }

    if (quality.transport === 'relay') {
        const reason = describePairingDirectBlockedReason(input.directBlockedReason)
        return {
            title: `安全中转${latencyText}`,
            detail: reason ? `${reason}；已自动走安全中转。` : '两边网络不能直连时自动绕路；能正常用，不用手动设置。',
            tone: quality.tone,
        }
    }

    return {
        title: '已连接 · 正在检测链路',
        detail: '不影响使用；Viby 正在确认是点对点直连还是安全中转。',
        tone: 'neutral',
    }
}
