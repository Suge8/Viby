import { useCallback, useMemo, useState } from 'react'
import { SurfaceGroupCard } from '@/components/SurfaceGroupCard'
import { SurfaceRouteHeader } from '@/components/SurfaceRouteHeader'
import { BlurFade } from '@/components/ui/blur-fade'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { getFontScaleOptions, useFontScale, type FontScale } from '@/hooks/useFontScale'
import { isIOSSafariBrowser } from '@/hooks/usePWAInstall'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useStandaloneDisplayMode } from '@/hooks/useStandaloneDisplayMode'
import { getAppearanceOptions, useAppearance, type AppearancePreference } from '@/hooks/useTheme'
import { useAppContext } from '@/lib/app-context'
import { shouldRegisterServiceWorkerForOrigin } from '@/lib/runtimeAssetPolicy'
import { useTranslation, type LocalePreference } from '@/lib/use-translation'
import { PROTOCOL_VERSION } from '@viby/protocol'
import {
    AppVersionSettingsIcon,
    AppearanceSettingsIcon,
    LanguageSettingsIcon,
    NotificationSettingsIcon,
} from './components/SettingsIcons'
import { SettingsActionCard, type SettingsActionCardAction } from './components/SettingsActionCard'
import { SettingsInfoRow } from './components/SettingsInfoRow'
import { SettingsSelectCard, type SettingsSelectOption } from './components/SettingsSelectCard'
import { localeOptions, type SettingsPanelId } from './settingsData'

const SETTINGS_SECTION_DELAYS = {
    language: 0.02,
    display: 0.08,
    notifications: 0.14,
    about: 0.2,
} as const

const NOTIFICATION_STATUS_LABEL_KEYS = {
    enabled: 'settings.notifications.status.enabled',
    disabled: 'settings.notifications.status.disabled',
    blocked: 'settings.notifications.status.blocked',
    installRequired: 'settings.notifications.status.installRequired',
    unavailable: 'settings.notifications.status.unavailable'
} as const

type NotificationAvailability =
    | 'enabled'
    | 'disabled'
    | 'blocked'
    | 'install-required'
    | 'unavailable'

type NotificationSummaryModel = {
    descriptionKey: string
    detailKey?: string
    statusLabelKey: keyof typeof NOTIFICATION_STATUS_LABEL_KEYS
}

function resolveNotificationSummary(options: {
    hasPushSupport: boolean
    isIOSSafari: boolean
    isStandalone: boolean
    isSubscribed: boolean
    permission: NotificationPermission
}): NotificationAvailability {
    if (options.isIOSSafari && !options.isStandalone) {
        return 'install-required'
    }

    if (!options.hasPushSupport) {
        return 'unavailable'
    }

    if (options.isSubscribed) {
        return 'enabled'
    }

    if (options.permission === 'denied') {
        return 'blocked'
    }

    return 'disabled'
}

function buildNotificationSummaryModel(availability: NotificationAvailability): NotificationSummaryModel {
    switch (availability) {
        case 'enabled':
            return {
                descriptionKey: 'settings.notifications.description.enabled',
                detailKey: 'settings.notifications.detail.events',
                statusLabelKey: 'enabled'
            }
        case 'blocked':
            return {
                descriptionKey: 'settings.notifications.description.blocked',
                detailKey: 'settings.notifications.detail.blocked',
                statusLabelKey: 'blocked'
            }
        case 'install-required':
            return {
                descriptionKey: 'settings.notifications.description.installRequired',
                detailKey: 'settings.notifications.detail.installRequired',
                statusLabelKey: 'installRequired'
            }
        case 'unavailable':
            return {
                descriptionKey: 'settings.notifications.description.unavailable',
                detailKey: 'settings.notifications.detail.unavailable',
                statusLabelKey: 'unavailable'
            }
        case 'disabled':
        default:
            return {
                descriptionKey: 'settings.notifications.description.disabled',
                detailKey: 'settings.notifications.detail.events',
                statusLabelKey: 'disabled'
            }
    }
}

function getLocaleOptionLabel(
    option: Readonly<{ nativeLabel?: string; labelKey?: string }>,
    t: (key: string) => string
): string {
    if (option.nativeLabel) {
        return option.nativeLabel
    }

    return option.labelKey ? t(option.labelKey) : ''
}

export default function SettingsPage(): React.JSX.Element {
    const { t, locale, localePreference, setLocale } = useTranslation()
    useFinalizeBootShell()
    const { api } = useAppContext()
    const goBack = useAppGoBack()
    const [openPanel, setOpenPanel] = useState<SettingsPanelId | null>(null)
    const { fontScale, setFontScale } = useFontScale()
    const { appearance, setAppearance } = useAppearance()
    const isStandalone = useStandaloneDisplayMode()
    const isIOSSafari = isIOSSafariBrowser()
    const {
        isSupported: isPushSupported,
        isSubscribed,
        permission,
        isPending: isPushPending,
        enableNotifications,
        disableNotifications,
        refreshSubscription
    } = usePushNotifications(api)

    const fontScaleOptions = getFontScaleOptions()
    const appearanceOptions = getAppearanceOptions()
    const currentLocale = getLocaleOptionLabel(
        localeOptions.find((option) => option.value === localePreference) ?? { nativeLabel: locale },
        t
    )
    const currentAppearanceLabel = appearanceOptions.find((option) => option.value === appearance)?.labelKey ?? 'settings.display.appearance.system'
    const currentFontScaleLabel = fontScaleOptions.find((option) => option.value === fontScale)?.label ?? '100%'
    const hasPushSupport = useMemo(() => (
        typeof window !== 'undefined' && shouldRegisterServiceWorkerForOrigin(window.location.origin) && isPushSupported
    ), [isPushSupported])
    const notificationAvailability = useMemo(() => resolveNotificationSummary({
        hasPushSupport,
        isIOSSafari,
        isStandalone,
        isSubscribed,
        permission
    }), [hasPushSupport, isIOSSafari, isStandalone, isSubscribed, permission])
    const notificationSummary = useMemo(
        () => buildNotificationSummaryModel(notificationAvailability),
        [notificationAvailability]
    )

    const togglePanel = useCallback((panel: SettingsPanelId) => {
        setOpenPanel((currentPanel) => currentPanel === panel ? null : panel)
    }, [])

    const handleLocaleSelect = useCallback((value: LocalePreference) => {
        setLocale(value)
        setOpenPanel(null)
    }, [setLocale])

    const handleAppearanceSelect = useCallback((value: AppearancePreference) => {
        setAppearance(value)
        setOpenPanel(null)
    }, [setAppearance])

    const handleFontScaleSelect = useCallback((value: FontScale) => {
        setFontScale(value)
        setOpenPanel(null)
    }, [setFontScale])
    const handleEnableNotifications = useCallback(() => {
        void enableNotifications()
    }, [enableNotifications])
    const handleDisableNotifications = useCallback(() => {
        void disableNotifications()
    }, [disableNotifications])
    const handleRefreshNotifications = useCallback(() => {
        void refreshSubscription()
    }, [refreshSubscription])

    const languageItems = useMemo<ReadonlyArray<SettingsSelectOption<LocalePreference>>>(
        () => localeOptions.map((option) => ({
            value: option.value,
            label: getLocaleOptionLabel(option, t),
        })),
        [t]
    )

    const appearanceItems = useMemo<ReadonlyArray<SettingsSelectOption<AppearancePreference>>>(
        () => appearanceOptions.map((option) => ({
            value: option.value,
            label: t(option.labelKey),
        })),
        [appearanceOptions, t]
    )

    const fontScaleItems = useMemo<ReadonlyArray<SettingsSelectOption<FontScale>>>(
        () => fontScaleOptions.map((option) => ({
            value: option.value,
            label: option.label,
        })),
        [fontScaleOptions]
    )
    const notificationActions = useMemo<ReadonlyArray<SettingsActionCardAction>>(() => {
        switch (notificationAvailability) {
            case 'enabled':
                return [
                    {
                        label: t('settings.notifications.actions.turnOff'),
                        onClick: handleDisableNotifications,
                        disabled: isPushPending,
                        variant: 'secondary'
                    },
                    {
                        label: t('settings.notifications.actions.refresh'),
                        onClick: handleRefreshNotifications,
                        disabled: isPushPending,
                        variant: 'ghost'
                    }
                ]
            case 'blocked':
                return [
                    {
                        label: t('settings.notifications.actions.refresh'),
                        onClick: handleRefreshNotifications,
                        disabled: isPushPending,
                        variant: 'secondary'
                    }
                ]
            case 'disabled':
                return [
                    {
                        label: t('settings.notifications.actions.turnOn'),
                        onClick: handleEnableNotifications,
                        disabled: isPushPending,
                        variant: 'default'
                    }
                ]
            case 'install-required':
            case 'unavailable':
            default:
                return []
        }
    }, [
        handleDisableNotifications,
        handleEnableNotifications,
        handleRefreshNotifications,
        isPushPending,
        notificationAvailability,
        t
    ])

    return (
        <div className="h-full overflow-y-auto">
            <div className="ds-stage-shell flex min-h-full flex-col px-3 pb-8">
                <SurfaceRouteHeader
                    title={t('settings.title')}
                    onBack={goBack}
                    eyebrow="Viby"
                />

                <main className="flex flex-1 flex-col gap-4 pb-2 pt-4">
                    <BlurFade delay={SETTINGS_SECTION_DELAYS.language}>
                        <SurfaceGroupCard
                            title={t('settings.language.title')}
                            icon={<LanguageSettingsIcon />}
                        >
                            <SettingsSelectCard
                                summary={{
                                    title: t('settings.language.label'),
                                    valueLabel: currentLocale,
                                }}
                                disclosure={{
                                    isOpen: openPanel === 'language',
                                    onToggle: () => togglePanel('language'),
                                }}
                                selection={{
                                    options: languageItems,
                                    selectedValue: localePreference,
                                    onSelect: handleLocaleSelect,
                                }}
                            />
                        </SurfaceGroupCard>
                    </BlurFade>

                    <BlurFade delay={SETTINGS_SECTION_DELAYS.display}>
                        <SurfaceGroupCard
                            title={t('settings.display.title')}
                            icon={<AppearanceSettingsIcon />}
                        >
                            <div className="py-0.5">
                                <SettingsSelectCard
                                    summary={{
                                        title: t('settings.display.appearance'),
                                        valueLabel: t(currentAppearanceLabel),
                                    }}
                                    disclosure={{
                                        isOpen: openPanel === 'appearance',
                                        onToggle: () => togglePanel('appearance'),
                                    }}
                                    selection={{
                                        options: appearanceItems,
                                        selectedValue: appearance,
                                        onSelect: handleAppearanceSelect,
                                    }}
                                />

                                <SettingsSelectCard
                                    summary={{
                                        title: t('settings.display.fontSize'),
                                        valueLabel: currentFontScaleLabel,
                                    }}
                                    disclosure={{
                                        isOpen: openPanel === 'fontScale',
                                        onToggle: () => togglePanel('fontScale'),
                                    }}
                                    selection={{
                                        options: fontScaleItems,
                                        selectedValue: fontScale,
                                        onSelect: handleFontScaleSelect,
                                    }}
                                />
                            </div>
                        </SurfaceGroupCard>
                    </BlurFade>

                    <BlurFade delay={SETTINGS_SECTION_DELAYS.notifications}>
                        <SurfaceGroupCard
                            title={t('settings.notifications.title')}
                            icon={<NotificationSettingsIcon />}
                        >
                            <SettingsActionCard
                                summary={{
                                    title: t('settings.notifications.label'),
                                    description: t(notificationSummary.descriptionKey),
                                    detail: notificationSummary.detailKey ? t(notificationSummary.detailKey) : undefined,
                                    valueLabel: t(NOTIFICATION_STATUS_LABEL_KEYS[notificationSummary.statusLabelKey]),
                                }}
                                actions={notificationActions}
                            />
                        </SurfaceGroupCard>
                    </BlurFade>

                    <BlurFade delay={SETTINGS_SECTION_DELAYS.about}>
                        <SurfaceGroupCard
                            title={t('settings.about.title')}
                            icon={<AppVersionSettingsIcon />}
                        >
                            <div className="divide-y divide-[var(--ds-border-subtle)]">
                                <SettingsInfoRow
                                    label={t('settings.about.appVersion')}
                                    value={__APP_VERSION__}
                                />
                                <SettingsInfoRow
                                    label={t('settings.about.protocolVersion')}
                                    value={String(PROTOCOL_VERSION)}
                                />
                            </div>
                        </SurfaceGroupCard>
                    </BlurFade>
                </main>
            </div>
        </div>
    )
}
