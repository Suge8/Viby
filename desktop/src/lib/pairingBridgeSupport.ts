import {
    buildPairingLinkPresentation,
    describePairingLinkTransport,
    formatPairingRoundTripTime,
    resolvePairingLinkTransport,
    resolvePairingSelectedCandidatePairStats,
} from '@viby/protocol/pairing'
import type { DesktopPairingSession, PairingBridgeState, PairingBridgeStats, PairingSessionSnapshot } from '@/types'
import { PAIRING_PHONE_PAUSED_MESSAGE, PAIRING_STALE_MESSAGE } from './pairingBridgeRecovery'

export type PairingConnectionKind = 'empty' | 'invite' | 'bound'

export interface PairingConnectionSummary {
    connected: boolean
    deviceCount: number
    title: string
    detail: string
    kind: PairingConnectionKind
    actionLabel: string
    removable: boolean
}

const BOUND_ACTION_LABEL = '显示手机入口'

function buildBoundPairingSummary(input: {
    connected?: boolean
    title: string
    detail: string
}): PairingConnectionSummary {
    return {
        connected: input.connected ?? false,
        deviceCount: 1,
        title: input.title,
        detail: input.detail,
        kind: 'bound',
        actionLabel: BOUND_ACTION_LABEL,
        removable: true,
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
            return '手机链路已接通。'
        case 'connecting':
            return '正在建立点对点链路。'
        case 'disconnected':
            return '手机已断开，等待重连。'
        case 'failed':
            return '点对点链路失败，正在重试。'
        case 'closed':
            return '配对链路已关闭。'
        default:
            return '等待手机接入。'
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

export function buildPairingConnectionSummary(input: {
    message?: string | null
    phase: PairingBridgeState['phase']
    pairing: PairingSessionSnapshot | null
    stats?: PairingBridgeStats | null
}): PairingConnectionSummary {
    if (input.phase === 'ready') {
        const label = input.pairing?.guest?.label ?? '手机'
        const stats = input.stats ?? null
        const transport = buildPairingLinkPresentation(stats).title
        return buildBoundPairingSummary({
            connected: true,
            title: '已连接',
            detail: `${label} · ${transport}`,
        })
    }

    if (input.phase === 'paused' && input.pairing?.guest) {
        return buildBoundPairingSummary({
            title: '手机在后台',
            detail: PAIRING_PHONE_PAUSED_MESSAGE,
        })
    }

    if (isStalePairingBridgeState(input) && input.pairing?.guest) {
        return buildBoundPairingSummary({
            title: '绑定已失效',
            detail: '请重新扫码',
        })
    }

    if ((input.phase === 'connecting' || input.phase === 'error') && input.pairing?.guest) {
        return buildBoundPairingSummary({
            title: '已绑定',
            detail: '打开手机页面后自动连接',
        })
    }

    if (input.pairing?.guest && input.pairing.approvalStatus === 'approved') {
        return buildBoundPairingSummary({
            title: '已绑定',
            detail: '开启中枢后自动连接',
        })
    }

    if (input.pairing) {
        return {
            connected: false,
            deviceCount: 0,
            title: input.pairing.guest ? '等待连接码' : '等待扫码',
            detail: input.pairing.guest ? '手机已扫码，输入连接码完成绑定' : '二维码已准备好',
            kind: 'invite',
            actionLabel: '显示二维码',
            removable: false,
        }
    }

    if (input.phase === 'error') {
        return {
            connected: false,
            deviceCount: 0,
            title: '连接异常',
            detail: '稍后再连接手机',
            kind: 'empty',
            actionLabel: '连接手机',
            removable: false,
        }
    }

    return {
        connected: false,
        deviceCount: 0,
        title: '未连接',
        detail: '等待手机扫码',
        kind: 'empty',
        actionLabel: '连接手机',
        removable: false,
    }
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
        return '等待手机扫码接入。'
    }

    if (pairing.approvalStatus === 'pending') {
        return pairing.shortCode ? `手机已扫码，等待输入连接码 ${pairing.shortCode}。` : '手机已扫码，等待输入连接码。'
    }

    if (pairing.approvalStatus === 'approved') {
        return '已绑定手机，等待手机页面接入。'
    }

    return '等待手机接入。'
}
