import { ReconnectingNoticeIcon } from '@/components/loading/ReconnectingNoticeIcon'
import type { Notice } from '@/lib/notice-center'
import { buildCompactPersistentNotice, PERSISTENT_NOTICE_IDS } from '@/lib/persistentNoticePresentation'
import type { RemotePairingErrorKey } from './remotePairingErrors'

export type RemotePairingRenderState = { kind: 'hydrating' | 'first-pairing' | 'running' | 'fatal' }

export type RemotePairingStatusSpec = {
    messageKey: RemotePairingErrorKey | null
    retry: boolean
}

const FINAL_SCAN_ERRORS = new Set<RemotePairingErrorKey>([
    'remotePairing.error.scanAgain',
    'remotePairing.error.pairingUnavailable',
])

export function shouldShowRemoteReconnectNotice(state: RemotePairingRenderState): boolean {
    return state.kind === 'running'
}

export function shouldBlockRemoteReadyShellInteraction(state: RemotePairingRenderState): boolean {
    return state.kind !== 'running'
}

export function buildRemoteReconnectNotice(): Notice {
    return buildCompactPersistentNotice({
        id: PERSISTENT_NOTICE_IDS.remotePairingReconnect,
        tone: 'info',
        title: '正在恢复连接',
        description: '正在重建安全通道',
        icon: <ReconnectingNoticeIcon />,
    })
}

export function buildRemoteStatusSpec(errorKey: RemotePairingErrorKey | null): RemotePairingStatusSpec {
    if (!errorKey) return { messageKey: null, retry: false }
    if (FINAL_SCAN_ERRORS.has(errorKey)) return { messageKey: 'remotePairing.error.scanAgain', retry: false }
    if (errorKey === 'remotePairing.error.regenerateQr') return { messageKey: errorKey, retry: false }
    return { messageKey: 'remotePairing.error.closedRetrying', retry: true }
}
