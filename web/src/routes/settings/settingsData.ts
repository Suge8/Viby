import type { LocalePreference } from '@/lib/use-translation'

export const localeOptions: ReadonlyArray<{
    value: LocalePreference
    nativeLabel?: string
    labelKey?: string
}> = [
    { value: 'system', labelKey: 'settings.language.followSystem' },
    { value: 'en', nativeLabel: 'English' },
    { value: 'zh-CN', nativeLabel: '简体中文' },
]

export type SettingsPanelId = 'appearance' | 'fontScale' | 'language'
