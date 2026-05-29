import { useCallback, useMemo } from 'react'
import { useNoticeCenter, usePersistentNotice } from '@/lib/notice-center'
import { useTranslation } from '@/lib/use-translation'
import { RemoteReconnectNoticeAction } from './RemoteReconnectNoticeAction'
import { formatRemotePairingDiagnostics, isRemotePairingDiagnosticsEnabled } from './remotePairingDiagnostics'
import { buildRemoteReconnectNotice, type RemotePairingReconnectStatus } from './remotePairingViewModel'

type ReconnectNoticeOptions = {
    onStop?: () => void
    reconnect: RemotePairingReconnectStatus | null
}

export function useRemoteReconnectNotice(options: ReconnectNoticeOptions): void {
    const { addToast } = useNoticeCenter()
    const { t } = useTranslation()
    const copyDiagnostics = useCallback(async () => {
        try {
            if (typeof navigator === 'undefined' || !navigator.clipboard) throw new Error('clipboard unavailable')
            await navigator.clipboard.writeText(formatRemotePairingDiagnostics())
            addToast({
                title: t('remotePairing.reconnectNotice.copyDiagnosticsSuccess'),
                tone: 'success',
                compact: true,
            })
        } catch {
            addToast({ title: t('remotePairing.reconnectNotice.copyDiagnosticsFailed'), tone: 'danger', compact: true })
        }
    }, [addToast, t])
    const action = useMemo(() => {
        if (!options.reconnect) return undefined
        const canStop = options.reconnect.tone === 'danger' && options.onStop
        const canCopy = isRemotePairingDiagnosticsEnabled()
        if (!canStop && !canCopy) return undefined
        return (
            <RemoteReconnectNoticeAction
                copyLabel={t('remotePairing.reconnectNotice.copyDiagnostics')}
                onCopyDiagnostics={canCopy ? copyDiagnostics : undefined}
                onStop={canStop ? options.onStop : undefined}
                stopLabel={t('remotePairing.reconnectNotice.stopAction')}
            />
        )
    }, [copyDiagnostics, options.reconnect, options.onStop, t])
    const notice = useMemo(
        () => (options.reconnect ? buildRemoteReconnectNotice({ t, reconnect: options.reconnect, action }) : null),
        [action, options.reconnect, t]
    )
    usePersistentNotice(notice)
}
