import type { DesktopPairingSession } from '@/types'

export type DesktopPairingStage = 'invite' | 'approval' | 'bound'

export interface DesktopPairingPresentation {
    codeValue: string
    codeHint: string
    guidance: string
    qrUrl: string
    statusHint: string | null
    stage: DesktopPairingStage
}

const INVITE_GUIDANCE = ''
const BOUND_GUIDANCE = ''

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

/**
 * Returns true when the workspace shell should surface the six-digit code
 * copy affordance. Only the approval stage shows a copyable code; the bound
 * stage replaces the code value with a status label ("已连接") that is not
 * meaningful to copy.
 */
export function shouldOfferPairingCodeCopy(stage: DesktopPairingStage): boolean {
    return stage === 'approval'
}

export function buildDesktopPairingPresentation(pairing: DesktopPairingSession): DesktopPairingPresentation {
    const snapshot = pairing.pairing
    const qrUrl = buildDesktopPairingQrUrl(pairing)

    if (!snapshot.guest) {
        return {
            codeValue: formatPairingCode(null),
            codeHint: '',
            guidance: INVITE_GUIDANCE,
            qrUrl,
            statusHint: '等待设备扫码',
            stage: 'invite',
        }
    }

    if (snapshot.approvalStatus === 'pending') {
        return {
            codeValue: formatPairingCode(snapshot.shortCode),
            codeHint: '配对码',
            guidance: BOUND_GUIDANCE,
            qrUrl,
            statusHint: null,
            stage: 'approval',
        }
    }

    if (snapshot.approvalStatus === 'approved') {
        return {
            codeValue: '已连接',
            codeHint: '',
            guidance: BOUND_GUIDANCE,
            qrUrl,
            statusHint: null,
            stage: 'bound',
        }
    }

    return {
        codeValue: formatPairingCode(null),
        codeHint: '等待确认',
        guidance: BOUND_GUIDANCE,
        qrUrl,
        statusHint: '等待设备接入',
        stage: 'invite',
    }
}
