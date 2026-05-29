import { FeatureGlobeIcon as GlobeIcon, FeatureMonitorIcon as MonitorIcon } from '@/components/featureIcons'
import { ReconnectingNoticeIcon } from '@/components/loading/ReconnectingNoticeIcon'
import { Button } from '@/components/ui/button'
import type { RealtimeBannerState } from '@/hooks/useRealtimeFeedback'
import type { Notice } from '@/lib/notice-center'
import { buildCompactPersistentNotice, PERSISTENT_NOTICE_IDS } from '@/lib/persistentNoticePresentation'

type TranslationFn = (key: string) => string
type RuntimeNoticeTone = 'offline' | 'recovering' | 'unavailable'

type RuntimeNoticeOptions = {
    banner: RealtimeBannerState
    isOnline: boolean
    t: TranslationFn
    localRuntimeUnavailableTitle?: string | null
    localRuntimeUnavailableDescription?: string | null
}

function buildNoticeIcon(tone: RuntimeNoticeTone): React.JSX.Element {
    switch (tone) {
        case 'offline':
            return <GlobeIcon className="h-4 w-4" />
        case 'recovering':
            return <ReconnectingNoticeIcon />
        case 'unavailable':
            return <MonitorIcon className="h-4 w-4" />
    }
}

function buildRuntimeRecoveringNotice(t: TranslationFn): Notice {
    return buildCompactPersistentNotice({
        id: PERSISTENT_NOTICE_IDS.runtime,
        tone: 'warning',
        icon: buildNoticeIcon('recovering'),
        title: t('runtime.recovering.title'),
        description: t('runtime.recovering.message'),
    })
}

export function buildOfflineNotice(isOnline: boolean, t: TranslationFn): Notice | null {
    if (isOnline) {
        return null
    }

    return buildCompactPersistentNotice({
        id: PERSISTENT_NOTICE_IDS.offline,
        tone: 'warning',
        icon: buildNoticeIcon('offline'),
        title: t('offline.title'),
    })
}

export function buildRuntimeNotice(options: RuntimeNoticeOptions): Notice | null {
    const { banner, isOnline, t, localRuntimeUnavailableTitle, localRuntimeUnavailableDescription } = options
    if (!isOnline) {
        return null
    }

    if (localRuntimeUnavailableDescription) {
        return buildCompactPersistentNotice({
            id: PERSISTENT_NOTICE_IDS.runtime,
            tone: 'warning',
            icon: buildNoticeIcon('unavailable'),
            title: localRuntimeUnavailableTitle ?? t('runtime.unavailable.title'),
            description: localRuntimeUnavailableDescription,
        })
    }

    if (banner.kind === 'busy' || banner.kind === 'restoring') {
        return buildRuntimeRecoveringNotice(t)
    }

    return null
}

export function buildRuntimeUpdateNotice(options: { onApply: () => void | Promise<void>; t: TranslationFn }): Notice {
    return buildCompactPersistentNotice({
        id: PERSISTENT_NOTICE_IDS.runtimeUpdate,
        tone: 'info',
        title: options.t('updateReady.title'),
        action: (
            <Button type="button" size="sm" variant="ghost" onClick={options.onApply}>
                {options.t('updateReady.action')}
            </Button>
        ),
    })
}
