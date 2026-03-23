import { useMemo } from 'react'
import { FloatingNoticeViewport } from '@/components/FloatingNoticeViewport'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useRuntimeUpdateState } from '@/hooks/useRuntimeUpdateState'
import type { RealtimeBannerState } from '@/hooks/useRealtimeFeedback'
import {
    buildOfflineNotice,
    buildRuntimeNotice
} from '@/lib/runtimeNoticePresentation'
import { usePersistentNotices, type Notice } from '@/lib/notice-center'
import { useTranslation } from '@/lib/use-translation'

export function AppFloatingNoticeLayer(props: { banner: RealtimeBannerState }) {
    const { t } = useTranslation()
    const isOnline = useOnlineStatus()
    const { snapshot: pendingRuntimeUpdate, applyUpdate } = useRuntimeUpdateState()
    const currentOrigin = typeof window === 'undefined' ? '' : window.location.origin

    const persistentNotices = useMemo(() => {
        const notices: Notice[] = []
        const offlineNotice = buildOfflineNotice(isOnline, t)

        if (offlineNotice) {
            notices.push(offlineNotice)
        }

        const runtimeNotice = buildRuntimeNotice({
            banner: props.banner,
            isOnline,
            t,
            currentOrigin,
            hasPendingRuntimeUpdate: pendingRuntimeUpdate !== null,
            applyRuntimeUpdate: applyUpdate
        })

        if (runtimeNotice) {
            notices.push(runtimeNotice)
        }

        return notices
    }, [applyUpdate, currentOrigin, isOnline, pendingRuntimeUpdate, props.banner, t])

    usePersistentNotices(persistentNotices)

    return <FloatingNoticeViewport />
}
