import type { AppNoticeTone } from '@/components/AppNotice'
import { ReconnectingNoticeIcon } from '@/components/loading/ReconnectingNoticeIcon'
import type { Notice } from '@/lib/notice-center'
import { buildCompactPersistentNotice, PERSISTENT_NOTICE_IDS } from '@/lib/persistentNoticePresentation'
import { getRemoteReconnectPhaseStepKey, type RemoteConnectingPhase } from '@/lib/remoteConnectingPhase'
import type { RemotePairingErrorKey } from './remotePairingErrors'

export type RemotePairingRenderState = {
    kind: 'approval' | 'booting' | 'error' | 'ready' | 'reconnecting'
}

export type RemotePairingNoticeSpec = {
    titleKey: string
    tone: AppNoticeTone
}

export type RemotePairingStatusSpec = {
    messageKey: RemotePairingErrorKey | null
    retry: boolean
}

const FINAL_SCAN_ERRORS = new Set<RemotePairingErrorKey>([
    'remotePairing.error.expired',
    'remotePairing.error.scanAgain',
    'remotePairing.error.closedScanAgain',
])

const REGENERATE_ERRORS = new Set<RemotePairingErrorKey>(['remotePairing.error.regenerateQr'])
const HOST_OFFLINE_ERRORS = new Set<RemotePairingErrorKey>([
    'remotePairing.error.hostClosed',
    'remotePairing.error.hostUnavailable',
])
const BLOCKED_ERRORS = new Set<RemotePairingErrorKey>([
    'remotePairing.error.p2pBlocked',
    'remotePairing.error.p2pTimedOut',
])

export function shouldShowRemoteReconnectNotice(state: RemotePairingRenderState, hasRetainedReady: boolean): boolean {
    return hasRetainedReady && (state.kind === 'reconnecting' || state.kind === 'booting')
}

export function shouldBlockRemoteReadyShellInteraction(state: RemotePairingRenderState): boolean {
    return state.kind === 'booting' || state.kind === 'reconnecting'
}

export function shouldRenderRemoteReadyShell(options: {
    hasRetainedReady: boolean
    pathname: string
    state: RemotePairingRenderState
}): boolean {
    if (!options.pathname.startsWith('/sessions')) return false
    if (options.state.kind === 'ready') return true
    return options.hasRetainedReady && (options.state.kind === 'booting' || options.state.kind === 'reconnecting')
}

export function buildRemoteReconnectNoticeSpec(): RemotePairingNoticeSpec {
    return {
        tone: 'info',
        titleKey: 'remotePairing.reconnectNotice.title',
    }
}

type ReconnectNoticeOptions = {
    t: (key: string) => string
    phase: RemoteConnectingPhase
}

export function buildRemoteReconnectNotice(options: ReconnectNoticeOptions): Notice {
    const spec = buildRemoteReconnectNoticeSpec()
    return buildCompactPersistentNotice({
        id: PERSISTENT_NOTICE_IDS.remotePairingReconnect,
        tone: spec.tone,
        title: options.t(spec.titleKey),
        description: options.t(getRemoteReconnectPhaseStepKey(options.phase)),
        icon: <ReconnectingNoticeIcon />,
    })
}

export function buildRemoteStatusSpec(errorKey: RemotePairingErrorKey | null): RemotePairingStatusSpec {
    if (!errorKey) return { messageKey: null, retry: false }
    if (FINAL_SCAN_ERRORS.has(errorKey)) return { messageKey: 'remotePairing.error.scanAgain', retry: false }
    if (REGENERATE_ERRORS.has(errorKey)) return { messageKey: 'remotePairing.error.regenerateQr', retry: false }
    if (HOST_OFFLINE_ERRORS.has(errorKey)) return { messageKey: 'remotePairing.error.hostClosed', retry: true }
    if (BLOCKED_ERRORS.has(errorKey)) return { messageKey: 'remotePairing.error.p2pBlocked', retry: true }
    return { messageKey: 'remotePairing.error.fallback', retry: true }
}
