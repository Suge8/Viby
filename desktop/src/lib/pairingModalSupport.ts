import type { DesktopPairingSession, PairingBridgeState } from '@/types'

export type DesktopPairingStage = 'invite' | 'approval' | 'bound' | 'paused' | 'ready'

export interface DesktopPairingPresentation {
    codeValue: string
    codeHint: string
    guidance: string
    qrUrl: string
    statusHint: string
    stage: DesktopPairingStage
}

const INVITE_GUIDANCE = '二维码会自动保持可用。手机扫码后，输入这里显示的 6 位数字。'
const BOUND_GUIDANCE = '用已配对手机扫码打开。换手机或浏览器数据已清空，请先解除绑定后重新扫码。'

export function shouldStartPairingBridge(pairing: DesktopPairingSession | null): boolean {
    return pairing?.pairing.approvalStatus === 'approved'
}

export function formatPairingCode(value: string | null | undefined): string {
    if (!value) {
        return '— — —'
    }

    if (/^\d{6}$/.test(value)) {
        return `${value.slice(0, 3)} ${value.slice(3)}`
    }

    return value
}

export function buildDesktopPairingQrUrl(pairing: DesktopPairingSession): string {
    if (!pairing.pairing.guest) {
        return pairing.pairingUrl
    }

    const fragmentIndex = pairing.pairingUrl.indexOf('#')
    return fragmentIndex === -1 ? pairing.pairingUrl : pairing.pairingUrl.slice(0, fragmentIndex)
}

export function buildDesktopPairingPresentation(
    pairing: DesktopPairingSession,
    bridgePhase: PairingBridgeState['phase'] = 'idle'
): DesktopPairingPresentation {
    const snapshot = pairing.pairing
    const qrUrl = buildDesktopPairingQrUrl(pairing)

    if (bridgePhase === 'ready') {
        return {
            codeValue: '已连接',
            codeHint: '已连接',
            guidance: BOUND_GUIDANCE,
            qrUrl,
            statusHint: '已连接',
            stage: 'ready',
        }
    }

    if (bridgePhase === 'paused') {
        return {
            codeValue: '已配对',
            codeHint: '已配对',
            guidance: BOUND_GUIDANCE,
            qrUrl,
            statusHint: '手机在后台，回来后自动接回',
            stage: 'paused',
        }
    }

    if (!snapshot.guest) {
        return {
            codeValue: formatPairingCode(null),
            codeHint: '手机扫码后显示',
            guidance: INVITE_GUIDANCE,
            qrUrl,
            statusHint: '等待手机扫码',
            stage: 'invite',
        }
    }

    if (snapshot.approvalStatus === 'pending') {
        return {
            codeValue: formatPairingCode(snapshot.shortCode),
            codeHint: '连接码',
            guidance: BOUND_GUIDANCE,
            qrUrl,
            statusHint: '等待手机输入连接码',
            stage: 'approval',
        }
    }

    if (snapshot.approvalStatus === 'approved') {
        return {
            codeValue: '已配对',
            codeHint: '手机入口',
            guidance: BOUND_GUIDANCE,
            qrUrl,
            statusHint: '打开已配对手机页面后自动连接',
            stage: 'bound',
        }
    }

    return {
        codeValue: formatPairingCode(null),
        codeHint: '等待确认',
        guidance: BOUND_GUIDANCE,
        qrUrl,
        statusHint: '等待手机接入',
        stage: 'invite',
    }
}
