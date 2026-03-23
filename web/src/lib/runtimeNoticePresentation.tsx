import { GlobeIcon, RefreshIcon } from '@/components/icons'
import type { RealtimeBannerState } from '@/hooks/useRealtimeFeedback'
import type { AppRecoveryReason } from '@/lib/appRecovery'
import type { Notice } from '@/lib/notice-center'
import { isLocalNetworkOrigin, shouldRegisterServiceWorkerForOrigin } from '@/lib/runtimeAssetRecovery'

const OFFLINE_NOTICE_ID = 'app:offline'
const RUNTIME_NOTICE_ID = 'app:runtime'

type TranslationFn = (key: string) => string
type RuntimeNoticeTone = 'offline' | 'busy' | 'restoring' | 'update-ready'

type RuntimeNoticeOptions = {
    banner: RealtimeBannerState
    isOnline: boolean
    t: TranslationFn
    currentOrigin: string
    hasPendingRuntimeUpdate: boolean
    applyRuntimeUpdate?: () => Promise<boolean>
}

function buildIconBadge(className: string, icon: React.JSX.Element): React.JSX.Element {
    return (
        <span className={className}>
            {icon}
        </span>
    )
}

function buildNoticeIcon(tone: RuntimeNoticeTone): React.JSX.Element {
    switch (tone) {
        case 'offline':
            return buildIconBadge(
                'inline-flex h-9 w-9 items-center justify-center rounded-[14px] border border-[color-mix(in_srgb,var(--ds-accent-gold)_26%,transparent)] bg-[color-mix(in_srgb,var(--ds-accent-gold)_12%,var(--ds-panel-strong))] text-[var(--ds-accent-gold)] shadow-[var(--ds-shadow-soft)]',
                <GlobeIcon className="h-4 w-4" />
            )
        case 'busy':
        case 'restoring':
            return buildRuntimeBusyIcon()
        case 'update-ready':
            return buildIconBadge(
                'inline-flex h-9 w-9 items-center justify-center rounded-[14px] border border-[color-mix(in_srgb,var(--ds-accent-lime)_26%,transparent)] bg-[color-mix(in_srgb,var(--ds-accent-lime)_10%,var(--ds-panel-strong))] text-[var(--ds-accent-lime)] shadow-[var(--ds-shadow-soft)]',
                <RefreshIcon className="h-4 w-4 animate-[spin_2.6s_linear_infinite]" />
            )
    }
}

function buildRuntimeBusyIcon(): React.JSX.Element {
    return (
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-[14px] border border-[color-mix(in_srgb,var(--ds-brand)_24%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--ds-brand)_12%,var(--ds-panel-strong))_0%,color-mix(in_srgb,var(--ds-accent-coral)_10%,var(--ds-panel-strong))_100%)] text-[var(--ds-brand)] shadow-[var(--ds-shadow-soft)]">
            <RefreshIcon className="h-4 w-4 animate-[spin_2.4s_linear_infinite]" />
        </span>
    )
}

function isAssetRecoveryReason(reason: AppRecoveryReason): boolean {
    switch (reason) {
        case 'build-assets-reset':
        case 'local-service-worker-reset':
        case 'vite-preload-error':
        case 'runtime-asset-reload':
            return true
        default:
            return false
    }
}

function getRecoveryLabels(
    reason: AppRecoveryReason,
    currentOrigin: string,
    t: TranslationFn
): {
    title: string
    description: string
} {
    switch (reason) {
        case 'page-discarded':
            return {
                title: t('recovery.pageDiscarded.title'),
                description: t('recovery.pageDiscarded.message')
            }
        case 'page-restored':
            return {
                title: t('recovery.pageRestored.title'),
                description: t('recovery.pageRestored.message')
            }
        default:
            if (isAssetRecoveryReason(reason)) {
                const descriptionKey = isLocalNetworkOrigin(currentOrigin)
                    ? 'recovery.runtimeAssets.localDevMessage'
                    : 'recovery.runtimeAssets.message'
                return {
                    title: t('recovery.runtimeAssets.title'),
                    description: t(descriptionKey)
                }
            }

            return {
                title: t('recovery.runtimeAssets.title'),
                description: t('recovery.runtimeAssets.message')
            }
    }
}

function buildRuntimeBusyNotice(t: TranslationFn): Notice {
    return {
        id: RUNTIME_NOTICE_ID,
        tone: 'info',
        icon: buildRuntimeBusyIcon(),
        title: t('runtime.recovering.title'),
        description: t('runtime.recovering.message')
    }
}

function buildCompactPersistentNotice(options: {
    id: string
    tone: Notice['tone']
    title: string
    icon: React.JSX.Element
    onPress?: Notice['onPress']
}): Notice {
    return {
        id: options.id,
        tone: options.tone,
        icon: options.icon,
        title: options.title,
        compact: true,
        onPress: options.onPress
    }
}

export function buildOfflineNotice(isOnline: boolean, t: TranslationFn): Notice | null {
    if (isOnline) {
        return null
    }

    return buildCompactPersistentNotice({
        id: OFFLINE_NOTICE_ID,
        tone: 'warning',
        icon: buildNoticeIcon('offline'),
        title: t('offline.title')
    })
}

export function buildRuntimeNotice(options: RuntimeNoticeOptions): Notice | null {
    const { banner, isOnline, t, currentOrigin, hasPendingRuntimeUpdate, applyRuntimeUpdate } = options
    if (!isOnline) {
        return null
    }

    if (banner.kind === 'restoring') {
        const labels = getRecoveryLabels(banner.reason, currentOrigin, t)
        return {
            id: RUNTIME_NOTICE_ID,
            tone: 'info',
            icon: buildNoticeIcon('restoring'),
            title: labels.title,
            description: labels.description
        }
    }

    if (banner.kind === 'busy') {
        return buildRuntimeBusyNotice(t)
    }

    if (!hasPendingRuntimeUpdate || !applyRuntimeUpdate || !shouldRegisterServiceWorkerForOrigin(currentOrigin)) {
        return null
    }

    return buildCompactPersistentNotice({
        id: RUNTIME_NOTICE_ID,
        tone: 'info',
        icon: buildNoticeIcon('update-ready'),
        title: t('updateReady.title'),
        onPress: async (): Promise<void> => {
            await applyRuntimeUpdate()
        }
    })
}
