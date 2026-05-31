import type { DesktopPairingSession, PairingBridgeState } from '@/types'

export const COPY_FEEDBACK_DURATION_MS = 1_600
export const PAIRING_SUCCESS_DISMISS_MS = 1_250
const PAIRING_INVITE_RENEW_LEAD_MS = 30_000

export type HubAction = 'start' | 'stop' | null
export type HubSwitchTone = 'off' | 'busy' | 'on' | 'stopping'
export type PairingInviteSource = 'broker' | 'lan'

export interface HubSwitchModel {
    tone: HubSwitchTone
    label: string
    actionLabel: string
    disabled: boolean
}

export type AccessEntry = { label: string; value: string; source: PairingInviteSource }

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

export function isExpiredUnapprovedPairing(pairing: DesktopPairingSession, now = Date.now()): boolean {
    return !pairing.pairing.guest && now > pairing.pairing.expiresAt
}

export function getPairingInviteRenewDelay(pairing: DesktopPairingSession | null, now = Date.now()): number | null {
    if (!pairing || pairing.pairing.guest || pairing.pairing.approvalStatus === 'approved') {
        return null
    }
    return isExpiredUnapprovedPairing(pairing, now)
        ? 0
        : Math.max(0, pairing.pairing.expiresAt - now - PAIRING_INVITE_RENEW_LEAD_MS)
}

export function isPairingInviteAccepted(input: {
    approved: boolean
    bridgePhase: PairingBridgeState['phase'] | null
}): boolean {
    return input.approved || input.bridgePhase === 'ready'
}

export function shouldDismissPairingInvite(input: {
    source: PairingInviteSource
    approved: boolean
    bridgePhase: PairingBridgeState['phase'] | null
}): boolean {
    return input.source === 'lan' ? input.approved : isPairingInviteAccepted(input)
}

export function shouldCancelPairingInviteOnClose(input: {
    approved: boolean
    bridgePhase: PairingBridgeState['phase'] | null
    successLocked?: boolean
}): boolean {
    return !input.successLocked && !isPairingInviteAccepted(input)
}

export function buildAccessEntries(input: {
    brokerHost: string | null
    brokerReady: boolean
    lanEntries: readonly { label: string; value: string }[]
    publicEntryLabel: string
}): AccessEntry[] {
    const entries: AccessEntry[] = []
    if (input.brokerReady && input.brokerHost) {
        entries.push({ label: input.publicEntryLabel, value: input.brokerHost, source: 'broker' })
    }
    for (const entry of input.lanEntries) entries.push({ ...entry, source: 'lan' })
    return entries
}
