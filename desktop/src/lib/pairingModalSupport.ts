import { isPairingInviteAccepted } from '@/lib/desktopShellModel'
import type { PairingBridgeState, PairingSessionSnapshot } from '@/types'

export type DesktopPairingStage = 'invite' | 'bound'

export interface DesktopPairingPresentation {
    codeValue: string
    codeHint: string
    qrUrl: string
    stage: DesktopPairingStage
}

/** Shared shape for any invite that owns a pairing snapshot + invite URL. */
export interface PairingPresentationInput {
    pairing: PairingSessionSnapshot
    pairingUrl: string
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

export function buildDesktopPairingQrUrl(pairing: PairingPresentationInput): string {
    return pairing.pairingUrl
}

/**
 * Returns true when the workspace shell should surface the six-digit code
 * copy affordance. The bound stage replaces the code with "已连接" so the
 * affordance is hidden there; the invite stage exposes the code immediately
 * because the broker assigns it at create time.
 */
export function shouldOfferPairingCodeCopy(stage: DesktopPairingStage): boolean {
    return stage === 'invite'
}

export function buildDesktopPairingPresentation(
    pairing: PairingPresentationInput,
    bridgePhase?: PairingBridgeState['phase']
): DesktopPairingPresentation {
    const snapshot = pairing.pairing
    const qrUrl = buildDesktopPairingQrUrl(pairing)
    const paired = isPairingInviteAccepted({
        approved: snapshot.approvalStatus === 'approved',
        bridgePhase: bridgePhase ?? null,
    })
    if (paired) return { codeValue: '已连接', codeHint: '', qrUrl, stage: 'bound' }

    return {
        codeValue: formatPairingCode(snapshot.shortCode),
        codeHint: '配对码',
        qrUrl,
        stage: 'invite',
    }
}
