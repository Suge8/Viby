import { PROTOCOL_VERSION } from '@viby/protocol'
import { useCallback, useMemo, useState } from 'react'
import { MotionReveal, MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { SurfaceGroupCard } from '@/components/SurfaceGroupCard'
import { SurfaceRouteHeader } from '@/components/SurfaceRouteHeader'
import { BlurFade } from '@/components/ui/blur-fade'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { type FontScale, getFontScaleOptions, useFontScale } from '@/hooks/useFontScale'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { isIOSSafariBrowser } from '@/hooks/usePWAInstall'
import { useStandaloneDisplayMode } from '@/hooks/useStandaloneDisplayMode'
import { type AppearancePreference, getAppearanceOptions, useAppearance } from '@/hooks/useTheme'
import { useAppContext } from '@/lib/app-context'
import { shouldRegisterServiceWorkerForOrigin } from '@/lib/runtimeAssetPolicy'
import { type LocalePreference, useTranslation } from '@/lib/use-translation'
import { SessionRoutePageSurface } from '@/routes/sessions/components/SessionRoutePageSurface'
import { SettingsActionCard, type SettingsActionCardAction } from './components/SettingsActionCard'
import {
    AppearanceSettingsIcon,
    AppVersionSettingsIcon,
    LanguageSettingsIcon,
    NotificationSettingsIcon,
} from './components/SettingsIcons'
import { SettingsInfoRow } from './components/SettingsInfoRow'
import { SettingsSelectCard, type SettingsSelectOption } from './components/SettingsSelectCard'
import { localeOptions, type SettingsPanelId } from './settingsData'
import {
    buildNotificationSummaryModel,
    NOTIFICATION_STATUS_LABEL_KEYS,
    resolveNotificationSummary,
} from './settingsNotificationSupport'
import {
    buildAppearanceItems,
    buildFontScaleItems,
    buildLanguageItems,
    buildNotificationActions,
    getLocaleOptionLabel,
    SETTINGS_SECTION_DELAYS,
} from './settingsPageSupport'

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
        refreshSubscription,
    } = usePushNotifications(api)

    const fontScaleOptions = getFontScaleOptions()
    const appearanceOptions = getAppearanceOptions()
    const currentLocale = getLocaleOptionLabel(
        localeOptions.find((option) => option.value === localePreference) ?? { nativeLabel: locale },
        t
    )
    const currentAppearanceLabel =
        appearanceOptions.find((option) => option.value === appearance)?.labelKey ??
        'settings.display.appearance.system'
    const currentFontScaleLabel = fontScaleOptions.find((option) => option.value === fontScale)?.label ?? '100%'
    const hasPushSupport = useMemo(
        () =>
            typeof window !== 'undefined' &&
            shouldRegisterServiceWorkerForOrigin(window.location.origin) &&
            isPushSupported,
        [isPushSupported]
    )
    const notificationAvailability = useMemo(
        () =>
            resolveNotificationSummary({
                hasPushSupport,
                isIOSSafari,
                isStandalone,
                isSubscribed,
                permission,
            }),
        [hasPushSupport, isIOSSafari, isStandalone, isSubscribed, permission]
    )
    const notificationSummary = useMemo(
        () => buildNotificationSummaryModel(notificationAvailability),
        [notificationAvailability]
    )

    const togglePanel = useCallback(
        (panel: SettingsPanelId) => setOpenPanel((currentPanel) => (currentPanel === panel ? null : panel)),
        []
    )

    const handleLocaleSelect = useCallback(
        (value: LocalePreference) => {
            setLocale(value)
            setOpenPanel(null)
        },
        [setLocale]
    )

    const handleAppearanceSelect = useCallback(
        (value: AppearancePreference) => {
            setAppearance(value)
            setOpenPanel(null)
        },
        [setAppearance]
    )

    const handleFontScaleSelect = useCallback(
        (value: FontScale) => {
            setFontScale(value)
            setOpenPanel(null)
        },
        [setFontScale]
    )
    const handleEnableNotifications = useCallback(() => void enableNotifications(), [enableNotifications])
    const handleDisableNotifications = useCallback(() => void disableNotifications(), [disableNotifications])
    const handleRefreshNotifications = useCallback(() => void refreshSubscription(), [refreshSubscription])

    const languageItems = useMemo<ReadonlyArray<SettingsSelectOption<LocalePreference>>>(
        () => buildLanguageItems(t),
        [t]
    )

    const appearanceItems = useMemo<ReadonlyArray<SettingsSelectOption<AppearancePreference>>>(
        () => buildAppearanceItems(appearanceOptions, t),
        [appearanceOptions, t]
    )

    const fontScaleItems = useMemo<ReadonlyArray<SettingsSelectOption<FontScale>>>(
        () => buildFontScaleItems(fontScaleOptions),
        [fontScaleOptions]
    )
    const notificationActions = useMemo<ReadonlyArray<SettingsActionCardAction>>(() => {
        return buildNotificationActions({
            notificationAvailability,
            t,
            isPushPending,
            onEnable: handleEnableNotifications,
            onDisable: handleDisableNotifications,
            onRefresh: handleRefreshNotifications,
        })
    }, [
        handleDisableNotifications,
        handleEnableNotifications,
        handleRefreshNotifications,
        isPushPending,
        notificationAvailability,
        t,
    ])

    return (
        <SessionRoutePageSurface className="overflow-y-auto">
            <div className="ds-stage-shell flex min-h-full flex-col px-3 pb-8">
                <SurfaceRouteHeader title={t('settings.title')} onBack={goBack} eyebrow="Viby" />

                <MotionReveal className="pb-2 pt-4" duration={0.42} delay={0.05} y={22}>
                    <MotionStaggerGroup className="flex flex-1 flex-col gap-4" delay={0.03} stagger={0.09}>
                        <MotionStaggerItem x={-20} y={16}>
                            <BlurFade delay={SETTINGS_SECTION_DELAYS.language}>
                                <SurfaceGroupCard title={t('settings.language.title')} icon={<LanguageSettingsIcon />}>
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
                        </MotionStaggerItem>

                        <MotionStaggerItem x={18} y={16}>
                            <BlurFade delay={SETTINGS_SECTION_DELAYS.display}>
                                <SurfaceGroupCard title={t('settings.display.title')} icon={<AppearanceSettingsIcon />}>
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
                        </MotionStaggerItem>

                        <MotionStaggerItem x={-18} y={16}>
                            <BlurFade delay={SETTINGS_SECTION_DELAYS.notifications}>
                                <SurfaceGroupCard
                                    title={t('settings.notifications.title')}
                                    icon={<NotificationSettingsIcon />}
                                >
                                    <SettingsActionCard
                                        summary={{
                                            title: t('settings.notifications.label'),
                                            description: t(notificationSummary.descriptionKey),
                                            detail: notificationSummary.detailKey
                                                ? t(notificationSummary.detailKey)
                                                : undefined,
                                            valueLabel: t(
                                                NOTIFICATION_STATUS_LABEL_KEYS[notificationSummary.statusLabelKey]
                                            ),
                                        }}
                                        actions={notificationActions}
                                    />
                                </SurfaceGroupCard>
                            </BlurFade>
                        </MotionStaggerItem>

                        <MotionStaggerItem x={20} y={16}>
                            <BlurFade delay={SETTINGS_SECTION_DELAYS.about}>
                                <SurfaceGroupCard title={t('settings.about.title')} icon={<AppVersionSettingsIcon />}>
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
                        </MotionStaggerItem>
                    </MotionStaggerGroup>
                </MotionReveal>
            </div>
        </SessionRoutePageSurface>
    )
}
