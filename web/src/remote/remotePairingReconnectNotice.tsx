import { useMemo } from 'react'
import { usePersistentNotice } from '@/lib/notice-center'
import { useTranslation } from '@/lib/use-translation'
import { useStickyTrue } from '@/lib/useStickyTrue'
import { buildRemoteReconnectNotice } from './remotePairingViewModel'

type ReconnectNoticeOptions = {
    attempt: number
    onStop?: () => void
    reconnecting: boolean
}

const MIN_VISIBLE_MS = 1200

export function useRemoteReconnectNotice(options: ReconnectNoticeOptions): boolean {
    const { t } = useTranslation()
    const showNotice = useStickyTrue(options.reconnecting, MIN_VISIBLE_MS)
    const notice = useMemo(
        () => buildRemoteReconnectNotice({ t, attempt: options.attempt, onStop: options.onStop }),
        [options.attempt, options.onStop, t]
    )
    usePersistentNotice(showNotice ? notice : null)
    return options.reconnecting
}
