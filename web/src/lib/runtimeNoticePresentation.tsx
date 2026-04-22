import {
    FeatureGlobeIcon as GlobeIcon,
    FeatureMonitorIcon as MonitorIcon,
    FeatureRefreshIcon as RefreshIcon,
} from '@/components/featureIcons'
import type { RealtimeBannerState } from '@/hooks/useRealtimeFeedback'
import type { AppRecoveryReason } from '@/lib/appRecovery'
import type { Notice } from '@/lib/notice-center'
import { isLocalNetworkOrigin } from '@/lib/runtimeAssetPolicy'

const OFFLINE_NOTICE_ID = 'app:offline'
const RUNTIME_NOTICE_ID = 'app:runtime'

type TranslationFn = (key: string) => string
type RuntimeNoticeTone = 'offline' | 'busy' | 'restoring' | 'update-ready' | 'unavailable'
type AssetRecoveryDescriptionKey =
    | 'recovery.runtimeAssets.devMessage'
    | 'recovery.runtimeAssets.localStaticMessage'
    | 'recovery.runtimeAssets.message'
type RecoveryLabels = {
    title: string
    description: string
}

type RuntimeNoticeOptions = {
    banner: RealtimeBannerState
    isOnline: boolean
    t: TranslationFn
    currentOrigin: string
    isDevRuntime: boolean
    hasPendingRuntimeUpdate: boolean
    applyRuntimeUpdate?: () => Promise<boolean>
    localRuntimeUnavailableTitle?: string | null
    localRuntimeUnavailableDescription?: string | null
}

function buildIconBadge(className: string, icon: React.JSX.Element): React.JSX.Element {
    return <span className={className}>{icon}</span>
}

function buildNoticeIcon(tone: RuntimeNoticeTone): React.JSX.Element {
    switch (tone) {
        case 'offline':
            return buildIconBadge(
                'ds-runtime-notice-icon-shell inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--ds-accent-gold)_26%,transparent)] bg-[color-mix(in_srgb,var(--ds-accent-gold)_12%,var(--ds-panel-strong))] text-[var(--ds-accent-gold)] shadow-[var(--ds-shadow-soft)]',
                <GlobeIcon className="h-4 w-4" />
            )
        case 'busy':
        case 'restoring':
            return buildRuntimeBusyIcon()
        case 'unavailable':
            return buildIconBadge(
                'ds-runtime-notice-icon-shell inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--ds-accent-coral)_24%,transparent)] bg-[color-mix(in_srgb,var(--ds-accent-coral)_10%,var(--ds-panel-strong))] text-[var(--ds-accent-coral)] shadow-[var(--ds-shadow-soft)]',
                <MonitorIcon className="h-4 w-4" />
            )
        case 'update-ready':
            return buildIconBadge(
                'ds-runtime-notice-icon-shell inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--ds-accent-lime)_26%,transparent)] bg-[color-mix(in_srgb,var(--ds-accent-lime)_10%,var(--ds-panel-strong))] text-[var(--ds-accent-lime)] shadow-[var(--ds-shadow-soft)]',
                <RefreshIcon className="h-4 w-4 animate-[spin_2.6s_linear_infinite]" />
            )
    }
}

function buildRuntimeBusyIcon(): React.JSX.Element {
    return (
        <span className="ds-runtime-notice-icon-shell inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--ds-brand)_24%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--ds-brand)_12%,var(--ds-panel-strong))_0%,color-mix(in_srgb,var(--ds-accent-coral)_10%,var(--ds-panel-strong))_100%)] text-[var(--ds-brand)] shadow-[var(--ds-shadow-soft)]">
            <RefreshIcon className="h-4 w-4 animate-[spin_2.4s_linear_infinite]" />
        </span>
    )
}

function isAssetRecoveryReason(reason: AppRecoveryReason): boolean {
    switch (reason) {
        case 'local-service-worker-reset':
        case 'vite-preload-error':
        case 'runtime-asset-reload':
            return true
        default:
            return false
    }
}

function getAssetRecoveryDescriptionKey(options: {
    currentOrigin: string
    isDevRuntime: boolean
}): AssetRecoveryDescriptionKey {
    if (options.isDevRuntime) {
        return 'recovery.runtimeAssets.devMessage'
    }

    if (isLocalNetworkOrigin(options.currentOrigin)) {
        return 'recovery.runtimeAssets.localStaticMessage'
    }

    return 'recovery.runtimeAssets.message'
}

function buildCompactPersistentNotice(options: {
    id: string
    tone: Notice['tone']
    title: string
    icon: React.JSX.Element
    description?: string
    onPress?: Notice['onPress']
}): Notice {
    return {
        id: options.id,
        tone: options.tone,
        icon: options.icon,
        title: options.title,
        description: options.description,
        compact: true,
        onPress: options.onPress,
    }
}

function getRecoveryLabels(
    reason: AppRecoveryReason,
    currentOrigin: string,
    isDevRuntime: boolean,
    t: TranslationFn
): RecoveryLabels {
    if (reason === 'page-discarded') {
        return {
            title: t('recovery.pageDiscarded.title'),
            description: t('recovery.pageDiscarded.message'),
        }
    }

    if (reason === 'page-restored') {
        return {
            title: t('recovery.pageRestored.title'),
            description: t('recovery.pageRestored.message'),
        }
    }

    if (!isAssetRecoveryReason(reason)) {
        return {
            title: t('recovery.runtimeAssets.title'),
            description: t('recovery.runtimeAssets.message'),
        }
    }

    return {
        title: t('recovery.runtimeAssets.title'),
        description: t(
            getAssetRecoveryDescriptionKey({
                currentOrigin,
                isDevRuntime,
            })
        ),
    }
}

function buildRuntimeBusyNotice(t: TranslationFn): Notice {
    return buildCompactPersistentNotice({
        id: RUNTIME_NOTICE_ID,
        tone: 'info',
        icon: buildRuntimeBusyIcon(),
        title: t('runtime.recovering.title'),
        description: t('runtime.recovering.message'),
    })
}

export function buildOfflineNotice(isOnline: boolean, t: TranslationFn): Notice | null {
    if (isOnline) {
        return null
    }

    return buildCompactPersistentNotice({
        id: OFFLINE_NOTICE_ID,
        tone: 'warning',
        icon: buildNoticeIcon('offline'),
        title: t('offline.title'),
    })
}

export function buildRuntimeNotice(options: RuntimeNoticeOptions): Notice | null {
    const {
        banner,
        isOnline,
        t,
        currentOrigin,
        isDevRuntime,
        hasPendingRuntimeUpdate,
        applyRuntimeUpdate,
        localRuntimeUnavailableTitle,
        localRuntimeUnavailableDescription,
    } = options
    if (!isOnline) {
        return null
    }

    if (localRuntimeUnavailableDescription) {
        return buildCompactPersistentNotice({
            id: RUNTIME_NOTICE_ID,
            tone: 'warning',
            icon: buildNoticeIcon('unavailable'),
            title: localRuntimeUnavailableTitle ?? t('runtime.unavailable.title'),
            description: localRuntimeUnavailableDescription,
        })
    }

    if (banner.kind === 'restoring') {
        const labels = getRecoveryLabels(banner.reason, currentOrigin, isDevRuntime, t)
        return buildCompactPersistentNotice({
            id: RUNTIME_NOTICE_ID,
            tone: 'info',
            icon: buildNoticeIcon('restoring'),
            title: labels.title,
            description: labels.description,
        })
    }

    if (banner.kind === 'busy') {
        return buildRuntimeBusyNotice(t)
    }

    if (!hasPendingRuntimeUpdate || !applyRuntimeUpdate) {
        return null
    }

    return buildCompactPersistentNotice({
        id: RUNTIME_NOTICE_ID,
        tone: 'info',
        icon: buildNoticeIcon('update-ready'),
        title: t('updateReady.title'),
        onPress: async (): Promise<void> => {
            await applyRuntimeUpdate()
        },
    })
}
