import type { FontScale } from '@/hooks/useFontScale'
import type { AppearancePreference } from '@/hooks/useTheme'
import type { LocalePreference } from '@/lib/use-translation'
import type { SettingsActionCardAction } from './components/SettingsActionCard'
import type { SettingsSelectOption } from './components/SettingsSelectCard'
import { localeOptions } from './settingsData'

export const SETTINGS_SECTION_DELAYS = {
    language: 0.02,
    display: 0.08,
    notifications: 0.14,
    about: 0.2,
} as const

export function getLocaleOptionLabel(
    option: Readonly<{ nativeLabel?: string; labelKey?: string }>,
    t: (key: string) => string
): string {
    if (option.nativeLabel) {
        return option.nativeLabel
    }
    return option.labelKey ? t(option.labelKey) : ''
}

export function buildLanguageItems(t: (key: string) => string): ReadonlyArray<SettingsSelectOption<LocalePreference>> {
    return localeOptions.map((option) => ({
        value: option.value,
        label: getLocaleOptionLabel(option, t),
    }))
}

export function buildAppearanceItems(
    appearanceOptions: ReadonlyArray<{ value: AppearancePreference; labelKey: string }>,
    t: (key: string) => string
): ReadonlyArray<SettingsSelectOption<AppearancePreference>> {
    return appearanceOptions.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
    }))
}

export function buildFontScaleItems(
    fontScaleOptions: ReadonlyArray<{ value: FontScale; label: string }>
): ReadonlyArray<SettingsSelectOption<FontScale>> {
    return fontScaleOptions.map((option) => ({
        value: option.value,
        label: option.label,
    }))
}

export function buildNotificationActions(input: {
    notificationAvailability: 'enabled' | 'blocked' | 'disabled' | 'install-required' | 'unavailable'
    t: (key: string) => string
    isPushPending: boolean
    onEnable: () => void
    onDisable: () => void
    onRefresh: () => void
}): ReadonlyArray<SettingsActionCardAction> {
    switch (input.notificationAvailability) {
        case 'enabled':
            return [
                {
                    label: input.t('settings.notifications.actions.turnOff'),
                    onClick: input.onDisable,
                    disabled: input.isPushPending,
                    variant: 'secondary',
                },
                {
                    label: input.t('settings.notifications.actions.refresh'),
                    onClick: input.onRefresh,
                    disabled: input.isPushPending,
                    variant: 'ghost',
                },
            ]
        case 'blocked':
            return [
                {
                    label: input.t('settings.notifications.actions.refresh'),
                    onClick: input.onRefresh,
                    disabled: input.isPushPending,
                    variant: 'secondary',
                },
            ]
        case 'disabled':
            return [
                {
                    label: input.t('settings.notifications.actions.turnOn'),
                    onClick: input.onEnable,
                    disabled: input.isPushPending,
                    variant: 'default',
                },
            ]
        default:
            return []
    }
}
