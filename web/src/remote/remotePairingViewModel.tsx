import type { PairingTransportState } from '@viby/protocol/pairing'
import { ReconnectingNoticeIcon } from '@/components/loading/ReconnectingNoticeIcon'
import type { Notice } from '@/lib/notice-center'
import { buildCompactPersistentNotice, PERSISTENT_NOTICE_IDS } from '@/lib/persistentNoticePresentation'
import type { RemotePairingErrorKey } from './remotePairingErrors'

export type RemotePairingRenderState = { kind: 'hydrating' | 'code-input' | 'running' | 'fatal' }
type RemotePairingReconnectTone = 'warning' | 'danger'

export type RemotePairingStatusSpec = {
    messageKey: RemotePairingErrorKey | null
    retry: boolean
}

export type RemotePairingReconnectStatus = {
    attempt: number
    tone: RemotePairingReconnectTone
}

export type RemotePairingLinkBadgeOverride = {
    label: string
    latency: string
    tone: RemotePairingReconnectTone
}

export type RemotePairingConnectionChrome = {
    interactionBlocked: boolean
    linkBadgeOverride: RemotePairingLinkBadgeOverride | null
    reconnect: RemotePairingReconnectStatus | null
}

type TranslationFn = (key: string, params?: Record<string, string | number>) => string

const FINAL_SCAN_ERRORS = new Set<RemotePairingErrorKey>([
    'remotePairing.error.scanAgain',
    'remotePairing.error.pairingUnavailable',
])

const RECONNECT_DANGER_ATTEMPT = 3

function shouldShowRemoteReconnect(options: {
    readyWorkspaceVisible: boolean
    state: RemotePairingRenderState
    transportState: PairingTransportState
}): boolean {
    if (!options.readyWorkspaceVisible) return false
    if (options.state.kind === 'hydrating') return true
    return options.state.kind === 'running' && options.transportState.kind === 'connecting'
}

function getRemoteReconnectAttempt(transportState: PairingTransportState): number {
    return transportState.kind === 'connecting' ? transportState.attempt : 0
}

function getRemoteReconnectTone(attempt: number): RemotePairingReconnectTone {
    return attempt >= RECONNECT_DANGER_ATTEMPT ? 'danger' : 'warning'
}

export function buildRemotePairingConnectionChrome(options: {
    readyWorkspaceVisible: boolean
    state: RemotePairingRenderState
    t: TranslationFn
    transportState: PairingTransportState
}): RemotePairingConnectionChrome {
    const reconnecting = shouldShowRemoteReconnect(options)
    const attempt = getRemoteReconnectAttempt(options.transportState)
    const reconnect = reconnecting ? { attempt, tone: getRemoteReconnectTone(attempt) } : null
    return {
        interactionBlocked: reconnecting || options.state.kind !== 'running',
        linkBadgeOverride: reconnect ? buildRemoteLinkBadgeOverride(reconnect, options.t) : null,
        reconnect,
    }
}

export function buildRemoteLinkBadgeOverride(
    reconnect: RemotePairingReconnectStatus,
    t: TranslationFn
): RemotePairingLinkBadgeOverride {
    return {
        label: t('remotePairing.linkBadge.reconnecting'),
        latency:
            reconnect.attempt >= RECONNECT_DANGER_ATTEMPT
                ? t('remotePairing.linkBadge.retryCount', { count: reconnect.attempt })
                : t('remotePairing.linkBadge.retrying'),
        tone: reconnect.tone,
    }
}

export function buildRemoteReconnectNotice(options: {
    action?: Notice['action']
    reconnect: RemotePairingReconnectStatus
    t: TranslationFn
}): Notice {
    return buildCompactPersistentNotice({
        id: PERSISTENT_NOTICE_IDS.remotePairingReconnect,
        tone: options.reconnect.tone,
        title: options.t('remotePairing.reconnectNotice.title'),
        description:
            options.reconnect.tone === 'danger'
                ? options.t('remotePairing.reconnectNotice.attemptCount', { count: options.reconnect.attempt })
                : undefined,
        icon: <ReconnectingNoticeIcon />,
        action: options.action,
    })
}

export function buildRemoteStatusSpec(errorKey: RemotePairingErrorKey | null): RemotePairingStatusSpec {
    if (!errorKey) return { messageKey: null, retry: false }
    if (FINAL_SCAN_ERRORS.has(errorKey)) return { messageKey: 'remotePairing.error.scanAgain', retry: false }
    if (errorKey === 'remotePairing.error.regenerateQr' || errorKey === 'remotePairing.error.updateDesktop') {
        return { messageKey: errorKey, retry: false }
    }
    // Preserve the actual `errorKey` message instead of collapsing every
    // retryable failure into the misleading "connection dropped" copy.
    // `host-unavailable` (`hostOffline`) is a first-connect not-ready state,
    // not a reconnect; the old text told the user the wrong story.
    return { messageKey: errorKey, retry: true }
}
