import {
    buildPairingLinkPresentation,
    describePairingLinkTransport,
    formatPairingRoundTripTime,
    resolvePairingLinkTransport,
    resolvePairingSelectedCandidatePairStats,
} from '@viby/protocol/pairing'
import type { DesktopPairingSession, PairingBridgeState, PairingBridgeStats, PairingSessionSnapshot } from '@/types'
import { formatDeviceTitle } from './deviceDisplay'
import { PAIRING_STALE_MESSAGE } from './pairingBridgeRecovery'

export type PairingConnectionKind = 'empty' | 'invite' | 'bound'
export type PairingConnectionTone = 'neutral' | 'pending' | 'active' | 'danger'

export interface PairingConnectionSummary {
    title: string
    detail: string
    kind: PairingConnectionKind
    tone: PairingConnectionTone
    actionLabel: string
}

const BOUND_ACTION_LABEL = '二维码'

function buildBoundPairingSummary(input: {
    tone: PairingConnectionTone
    title: string
    detail: string
}): PairingConnectionSummary {
    return {
        title: input.title,
        detail: input.detail,
        kind: 'bound',
        tone: input.tone,
        actionLabel: BOUND_ACTION_LABEL,
    }
}

function buildInvitePairingSummary(pairing: PairingSessionSnapshot): PairingConnectionSummary {
    const claimed = Boolean(pairing.guest)
    return {
        title: claimed ? '等待配对码' : '等待扫码',
        detail: claimed ? '设备已扫码，输入配对码完成绑定' : '二维码已准备好',
        kind: 'invite',
        tone: claimed ? 'pending' : 'neutral',
        actionLabel: '显示二维码',
    }
}

function buildEmptyPairingSummary(error: boolean): PairingConnectionSummary {
    return {
        title: error ? '连接异常' : '未连接',
        detail: error ? '稍后再连接设备' : '等待设备扫码',
        kind: 'empty',
        tone: error ? 'danger' : 'neutral',
        actionLabel: '连接设备',
    }
}

export function toIceServers(servers: DesktopPairingSession['iceServers']): RTCIceServer[] {
    return servers.map((server) => ({
        urls: server.urls,
        username: server.username,
        credential: server.credential,
    }))
}

export function describePairingConnectionState(state: RTCPeerConnectionState): string {
    switch (state) {
        case 'connected':
            return '设备链路已接通。'
        case 'connecting':
            return '正在建立点对点链路。'
        case 'disconnected':
            return '设备已断开，等待重连。'
        case 'failed':
            return '点对点链路失败，正在重试。'
        case 'closed':
            return '配对链路已关闭。'
        default:
            return '等待设备接入。'
    }
}

export function describePairingTransport(stats: PairingBridgeStats | null): string {
    return describePairingLinkTransport(stats)
}

export function isStalePairingBridgeState(state: {
    message?: string | null
    phase: PairingBridgeState['phase']
}): boolean {
    return state.phase === 'error' && state.message === PAIRING_STALE_MESSAGE
}

export function describePairingTransportBadge(stats: PairingBridgeStats | null): string | null {
    if (!stats) {
        return null
    }

    const label = describePairingTransport(stats)
    const latency = formatPairingRoundTripTime(stats.currentRoundTripTimeMs)
    return latency ? `${label} · ${latency}` : label
}

type PairingConnectionInput = {
    message?: string | null
    phase: PairingBridgeState['phase']
    pairing: PairingSessionSnapshot | null
    stats?: PairingBridgeStats | null
}

function resolveGuestLabel(guest: PairingSessionSnapshot['guest']): string {
    if (!guest) return '设备'
    const platform = typeof guest.metadata?.platform === 'string' ? guest.metadata.platform : null
    return formatDeviceTitle({ name: guest.label, platform, channel: 'scan' })
}

function buildBoundPairingConnectionSummary(input: PairingConnectionInput): PairingConnectionSummary | null {
    if (input.phase === 'ready') {
        const label = resolveGuestLabel(input.pairing?.guest ?? null)
        const transport = buildPairingLinkPresentation(input.stats ?? null).title
        return buildBoundPairingSummary({ tone: 'active', title: '设备已连接', detail: `${label} · ${transport}` })
    }

    if (!input.pairing?.guest) {
        return null
    }

    if (input.phase === 'paused') {
        return buildBoundPairingSummary({
            tone: 'pending',
            title: '已配对',
            detail: '',
        })
    }

    if (isStalePairingBridgeState(input)) {
        return buildBoundPairingSummary({ tone: 'danger', title: '绑定已失效', detail: '请重新扫码' })
    }

    if (input.phase === 'error') {
        return buildBoundPairingSummary({ tone: 'danger', title: '连接异常', detail: '请重新打开设备页面' })
    }

    if (input.phase === 'connecting') {
        return buildBoundPairingSummary({ tone: 'pending', title: '已配对', detail: '' })
    }

    return input.pairing.approvalStatus === 'approved'
        ? buildBoundPairingSummary({ tone: 'pending', title: '已配对', detail: '' })
        : null
}

export function buildPairingConnectionSummary(input: PairingConnectionInput): PairingConnectionSummary {
    const bound = buildBoundPairingConnectionSummary(input)
    if (bound) {
        return bound
    }

    return input.pairing ? buildInvitePairingSummary(input.pairing) : buildEmptyPairingSummary(input.phase === 'error')
}

export async function readPairingBridgeStats(
    peer: RTCPeerConnection,
    restartCount: number
): Promise<PairingBridgeStats> {
    const report = await peer.getStats()
    const selected = resolvePairingSelectedCandidatePairStats(report)

    if (!selected) {
        return {
            transport: 'unknown',
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: null,
            restartCount,
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
        restartCount,
    }
}

export function describePairingSnapshotMessage(pairing: PairingSessionSnapshot): string {
    if (!pairing.guest) {
        return '等待设备扫码接入。'
    }

    if (pairing.approvalStatus === 'pending') {
        return pairing.shortCode ? `设备已扫码，等待输入配对码 ${pairing.shortCode}。` : '设备已扫码，等待输入配对码。'
    }

    if (pairing.approvalStatus === 'approved') {
        return '已绑定设备，等待设备页面接入。'
    }

    return '等待设备接入。'
}
