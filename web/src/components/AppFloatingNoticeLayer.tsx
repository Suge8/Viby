import { useLocation } from '@tanstack/react-router'
import { useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import { FloatingNoticeViewport } from '@/components/FloatingNoticeViewport'
import { useRuntime } from '@/hooks/queries/useRuntime'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { RealtimeBannerState } from '@/hooks/useRealtimeFeedback'
import { useRuntimeUpdateState } from '@/hooks/useRuntimeUpdateState'
import { type Notice, usePersistentNotices } from '@/lib/notice-center'
import { getNoticePreset } from '@/lib/noticePresets'
import { getRuntimeAvailabilityCopy, getRuntimeAvailabilityPresentation } from '@/lib/runtimeAvailabilityPresentation'
import { buildOfflineNotice, buildRuntimeNotice } from '@/lib/runtimeNoticePresentation'
import { useTranslation } from '@/lib/use-translation'
import { NEW_SESSION_ROUTE } from '@/routes/sessions/sessionRoutePaths'

export function AppFloatingNoticeLayer(props: { api: ApiClient; banner: RealtimeBannerState }) {
    const { t } = useTranslation()
    const pathname = useLocation({
        select: (location) => location.pathname,
    })
    const isOnline = useOnlineStatus()
    const { snapshot: pendingRuntimeUpdate, applyUpdate } = useRuntimeUpdateState()
    const { runtime, isLoading: runtimeLoading, error: runtimeError } = useRuntime(props.api, true)
    const currentOrigin = typeof window === 'undefined' ? '' : window.location.origin
    const loadRuntimeErrorPreset = getNoticePreset('newSessionLoadRuntimeError', t)
    const runtimeAvailability = useMemo(
        () =>
            getRuntimeAvailabilityPresentation({
                runtime,
                isLoading: runtimeLoading,
                error: runtimeError,
                t,
            }),
        [runtime, runtimeError, runtimeLoading, t]
    )
    const runtimeAvailabilityCopy = useMemo(
        () =>
            getRuntimeAvailabilityCopy(runtimeAvailability, {
                loadRuntimeErrorTitle: loadRuntimeErrorPreset.title,
                t,
            }),
        [loadRuntimeErrorPreset.title, runtimeAvailability, t]
    )
    const suppressRouteOwnedRuntimeNotice = pathname === NEW_SESSION_ROUTE

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
            isDevRuntime: import.meta.env.DEV,
            hasPendingRuntimeUpdate: pendingRuntimeUpdate !== null,
            applyRuntimeUpdate: applyUpdate,
            localRuntimeUnavailableTitle: suppressRouteOwnedRuntimeNotice
                ? null
                : (runtimeAvailabilityCopy?.noticeTitle ?? null),
            localRuntimeUnavailableDescription: suppressRouteOwnedRuntimeNotice
                ? null
                : (runtimeAvailabilityCopy?.noticeDescription ?? null),
        })

        if (runtimeNotice) {
            notices.push(runtimeNotice)
        }

        return notices
    }, [
        applyUpdate,
        currentOrigin,
        isOnline,
        pendingRuntimeUpdate,
        props.banner,
        runtimeAvailabilityCopy,
        suppressRouteOwnedRuntimeNotice,
        t,
    ])

    usePersistentNotices(persistentNotices)

    return <FloatingNoticeViewport />
}
