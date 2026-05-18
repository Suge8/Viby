import type { DesktopPairingSession, PairingBridgeState } from '@/types'

export const COPY_FEEDBACK_DURATION_MS = 1_600
export const PAIRING_SUCCESS_DISMISS_MS = 1_250
const PAIRING_INVITE_RENEW_LEAD_MS = 30_000

export type HubAction = 'start' | 'stop' | null
export type HubSwitchTone = 'off' | 'busy' | 'on' | 'stopping'

export interface HubSwitchModel {
    tone: HubSwitchTone
    label: string
    actionLabel: string
    disabled: boolean
}

export function buildHubSwitchModel(input: {
    action: HubAction
    busy: boolean
    running: boolean
    ready: boolean
}): HubSwitchModel {
    if (input.action === 'stop') {
        return {
            tone: 'stopping',
            label: '关闭中',
            actionLabel: '中枢正在关闭',
            disabled: true,
        }
    }

    if (input.busy || (input.running && !input.ready)) {
        return {
            tone: 'busy',
            label: '启动中',
            actionLabel: '中枢正在启动',
            disabled: true,
        }
    }

    if (input.ready) {
        return {
            tone: 'on',
            label: '运行中',
            actionLabel: '关闭中枢',
            disabled: false,
        }
    }

    return {
        tone: 'off',
        label: '开启中枢',
        actionLabel: '开启中枢',
        disabled: false,
    }
}

export function isExpiredUnclaimedPairing(pairing: DesktopPairingSession, now = Date.now()): boolean {
    return !pairing.pairing.guest && now > pairing.pairing.ticketExpiresAt
}

export function shouldPollPairingSnapshot(
    pairing: DesktopPairingSession | null,
    bridgePhase: PairingBridgeState['phase'],
    inviteVisible = false
): boolean {
    if (!pairing || bridgePhase === 'ready' || pairing.pairing.approvalStatus === 'approved') {
        return false
    }
    return inviteVisible || Boolean(pairing.pairing.guest)
}

export function getPairingInviteRenewDelay(pairing: DesktopPairingSession | null, now = Date.now()): number | null {
    if (!pairing || pairing.pairing.guest || pairing.pairing.approvalStatus === 'approved') {
        return null
    }
    return isExpiredUnclaimedPairing(pairing, now)
        ? 0
        : Math.max(0, pairing.pairing.ticketExpiresAt - now - PAIRING_INVITE_RENEW_LEAD_MS)
}
