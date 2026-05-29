import type { FontScale } from '@/hooks/useFontScale'
import type { AppearancePreference } from '@/hooks/useTheme'
import type { LocalePreference } from '@/lib/use-translation'
import type { SettingsSelectOption } from './components/SettingsSelectCard'
import { localeOptions } from './settingsData'

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
