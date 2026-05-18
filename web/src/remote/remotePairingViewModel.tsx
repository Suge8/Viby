import { ReconnectingNoticeIcon } from '@/components/loading/ReconnectingNoticeIcon'
import { Button } from '@/components/ui/button'
import type { Notice } from '@/lib/notice-center'
import { buildCompactPersistentNotice, PERSISTENT_NOTICE_IDS } from '@/lib/persistentNoticePresentation'
import type { RemotePairingErrorKey } from './remotePairingErrors'

export type RemotePairingRenderState = { kind: 'hydrating' | 'first-pairing' | 'running' | 'fatal' }

export type RemotePairingStatusSpec = {
    messageKey: RemotePairingErrorKey | null
    retry: boolean
}

type TranslationFn = (key: string, params?: Record<string, string | number>) => string

const FINAL_SCAN_ERRORS = new Set<RemotePairingErrorKey>([
    'remotePairing.error.scanAgain',
    'remotePairing.error.pairingUnavailable',
])

export function shouldShowRemoteReconnectNotice(options: {
    state: RemotePairingRenderState
    transportKind: 'connecting' | 'ready' | 'fatal'
}): boolean {
    return options.state.kind === 'running' && options.transportKind === 'connecting'
}

export function shouldBlockRemoteReadyShellInteraction(
    state: RemotePairingRenderState,
    reconnecting: boolean
): boolean {
    return reconnecting || state.kind !== 'running'
}

export function buildRemoteReconnectNotice(options: {
    attempt: number
    onStop?: () => void
    t: TranslationFn
}): Notice {
    const showStop = options.attempt > 2 && options.onStop
    return buildCompactPersistentNotice({
        id: PERSISTENT_NOTICE_IDS.remotePairingReconnect,
        tone: 'info',
        title: options.t('remotePairing.reconnectNotice.title'),
        description:
            options.attempt > 2
                ? options.t('remotePairing.reconnectNotice.attemptCount', { count: options.attempt })
                : options.t('remotePairing.reconnectNotice.phase.finalizing'),
        icon: <ReconnectingNoticeIcon />,
        action: showStop ? (
            <Button type="button" size="sm" variant="ghost" onClick={options.onStop}>
                {options.t('remotePairing.reconnectNotice.stopAction')}
            </Button>
        ) : undefined,
    })
}

export function buildRemoteStatusSpec(errorKey: RemotePairingErrorKey | null): RemotePairingStatusSpec {
    if (!errorKey) return { messageKey: null, retry: false }
    if (FINAL_SCAN_ERRORS.has(errorKey)) return { messageKey: 'remotePairing.error.scanAgain', retry: false }
    if (errorKey === 'remotePairing.error.regenerateQr') return { messageKey: errorKey, retry: false }
    return { messageKey: 'remotePairing.error.closedRetrying', retry: true }
}
