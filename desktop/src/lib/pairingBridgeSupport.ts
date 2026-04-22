import type { DesktopPairingSession, PairingBridgeStats, PairingSessionSnapshot } from '@/types'

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
    if (!stats) {
        return '采样中'
    }

    switch (stats.transport) {
        case 'relay':
            return 'TURN Relay'
        case 'direct':
            return 'P2P Direct'
        default:
            return '未知'
    }
}

export async function readPairingBridgeStats(
    peer: RTCPeerConnection,
    restartCount: number
): Promise<PairingBridgeStats> {
    const report = await peer.getStats()
    let selectedPair: RTCStats | null = null

    report.forEach((stat) => {
        if (stat.type !== 'candidate-pair') {
            return
        }

        const candidatePair = stat as RTCIceCandidatePairStats & { selected?: boolean }
        if (candidatePair.selected === true || (candidatePair.nominated && candidatePair.state === 'succeeded')) {
            selectedPair = candidatePair
        }
    })

    if (!selectedPair) {
        return {
            transport: 'unknown',
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: null,
            restartCount,
        }
    }

    const pairStats = selectedPair as RTCIceCandidatePairStats
    const localStats = pairStats.localCandidateId ? report.get(pairStats.localCandidateId) : null
    const remoteStats = pairStats.remoteCandidateId ? report.get(pairStats.remoteCandidateId) : null
    const localCandidateType =
        localStats && 'candidateType' in localStats && typeof localStats.candidateType === 'string'
            ? localStats.candidateType
            : null
    const remoteCandidateType =
        remoteStats && 'candidateType' in remoteStats && typeof remoteStats.candidateType === 'string'
            ? remoteStats.candidateType
            : null

    return {
        transport: localCandidateType === 'relay' || remoteCandidateType === 'relay' ? 'relay' : 'direct',
        localCandidateType,
        remoteCandidateType,
        currentRoundTripTimeMs:
            typeof pairStats.currentRoundTripTime === 'number'
                ? Math.round(pairStats.currentRoundTripTime * 1000)
                : null,
        restartCount,
    }
}

export function describePairingSnapshotMessage(pairing: PairingSessionSnapshot): string {
    if (!pairing.guest) {
        return '等待手机扫码接入。'
    }

    if (pairing.approvalStatus === 'pending') {
        return pairing.shortCode
            ? `手机已扫码，请核对确认码 ${pairing.shortCode} 后批准接入。`
            : '手机已扫码，等待桌面批准接入。'
    }

    if (pairing.approvalStatus === 'approved') {
        return '桌面已批准接入，正在建立点对点链路。'
    }

    return '等待手机接入。'
}
