import type { DesktopPairingSession, PairingBridgeState } from '@/types'

export type DesktopPairingStage = 'invite' | 'approval' | 'connecting' | 'paused' | 'ready'

export interface DesktopPairingPresentation {
    codeValue: string
    codeHint: string
    statusHint: string
    stage: DesktopPairingStage
}

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

export function buildDesktopPairingPresentation(
    pairing: DesktopPairingSession,
    bridgePhase: PairingBridgeState['phase'] = 'idle'
): DesktopPairingPresentation {
    const snapshot = pairing.pairing

    if (bridgePhase === 'ready') {
        return {
            codeValue: formatPairingCode(snapshot.shortCode),
            codeHint: '已连接',
            statusHint: '已连接',
            stage: 'ready',
        }
    }

    if (bridgePhase === 'paused') {
        return {
            codeValue: formatPairingCode(snapshot.shortCode),
            codeHint: '已配对',
            statusHint: '手机在后台，回来后自动接回',
            stage: 'paused',
        }
    }

    if (!snapshot.guest) {
        return {
            codeValue: formatPairingCode(null),
            codeHint: '手机扫码后显示',
            statusHint: '等待手机扫码',
            stage: 'invite',
        }
    }

    if (snapshot.approvalStatus === 'pending') {
        return {
            codeValue: formatPairingCode(snapshot.shortCode),
            codeHint: '连接码',
            statusHint: '等待手机输入连接码',
            stage: 'approval',
        }
    }

    if (snapshot.approvalStatus === 'approved') {
        return {
            codeValue: formatPairingCode(snapshot.shortCode),
            codeHint: '已输入',
            statusHint: '正在连接手机',
            stage: 'connecting',
        }
    }

    return {
        codeValue: formatPairingCode(null),
        codeHint: '等待确认',
        statusHint: '等待手机接入',
        stage: 'invite',
    }
}
