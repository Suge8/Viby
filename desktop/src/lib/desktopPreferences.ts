export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export const LANGUAGE_PREFERENCES = ['system', 'zh', 'en'] as const
export const ENTRY_MODE_PREFERENCES = ['local', 'lan'] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type ThemeMode = Exclude<ThemePreference, 'system'>
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number]
export type DesktopLanguage = Exclude<LanguagePreference, 'system'>
export type EntryModePreference = (typeof ENTRY_MODE_PREFERENCES)[number]

const THEME_STORAGE_KEY = 'viby.desktop.theme'
const LANGUAGE_STORAGE_KEY = 'viby.desktop.language'
const ENTRY_MODE_STORAGE_KEY = 'viby.desktop.entry-mode'

function isThemePreference(value: string | null): value is ThemePreference {
    return THEME_PREFERENCES.includes(value as ThemePreference)
}

function isLanguagePreference(value: string | null): value is LanguagePreference {
    return LANGUAGE_PREFERENCES.includes(value as LanguagePreference)
}

function isEntryModePreference(value: string | null): value is EntryModePreference {
    return ENTRY_MODE_PREFERENCES.includes(value as EntryModePreference)
}

export function getSystemTheme(matchMedia: Pick<Window, 'matchMedia'>['matchMedia'] | undefined): ThemeMode {
    return matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getSystemLanguage(language: string | undefined): DesktopLanguage {
    return language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function resolveThemePreference(preference: ThemePreference, systemTheme: ThemeMode): ThemeMode {
    return preference === 'system' ? systemTheme : preference
}

export function resolveLanguagePreference(
    preference: LanguagePreference,
    systemLanguage: DesktopLanguage
): DesktopLanguage {
    return preference === 'system' ? systemLanguage : preference
}

export function readThemePreference(storage: Storage | undefined): ThemePreference {
    const value = storage?.getItem(THEME_STORAGE_KEY) ?? null
    return isThemePreference(value) ? value : 'system'
}

export function readLanguagePreference(storage: Storage | undefined): LanguagePreference {
    const value = storage?.getItem(LANGUAGE_STORAGE_KEY) ?? null
    return isLanguagePreference(value) ? value : 'system'
}

export function readEntryModePreference(storage: Storage | undefined): EntryModePreference {
    const value = storage?.getItem(ENTRY_MODE_STORAGE_KEY) ?? null
    return isEntryModePreference(value) ? value : 'local'
}

export function writeThemePreference(storage: Storage | undefined, preference: ThemePreference): void {
    storage?.setItem(THEME_STORAGE_KEY, preference)
}

export function writeLanguagePreference(storage: Storage | undefined, preference: LanguagePreference): void {
    storage?.setItem(LANGUAGE_STORAGE_KEY, preference)
}

export function writeEntryModePreference(storage: Storage | undefined, preference: EntryModePreference): void {
    storage?.setItem(ENTRY_MODE_STORAGE_KEY, preference)
}
