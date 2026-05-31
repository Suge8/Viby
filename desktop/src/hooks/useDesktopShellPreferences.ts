import { useEffect, useState } from 'react'
import {
    getSystemLanguage,
    getSystemTheme,
    type LanguagePreference,
    readLanguagePreference,
    readThemePreference,
    resolveLanguagePreference,
    resolveThemePreference,
    type ThemePreference,
    writeLanguagePreference,
    writeThemePreference,
} from '@/lib/desktopPreferences'

export function useDesktopShellPreferences() {
    const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() =>
        readThemePreference(globalThis.localStorage)
    )
    const [languagePreference, setLanguagePreferenceState] = useState<LanguagePreference>(() =>
        readLanguagePreference(globalThis.localStorage)
    )
    const [systemTheme, setSystemTheme] = useState(() => getSystemTheme(globalThis.matchMedia?.bind(globalThis)))
    const [systemLanguage] = useState(() => getSystemLanguage(globalThis.navigator?.language))

    useEffect(() => {
        const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
        if (!query) return
        const handleChange = (event: MediaQueryListEvent): void => setSystemTheme(event.matches ? 'dark' : 'light')
        query.addEventListener('change', handleChange)
        return () => query.removeEventListener('change', handleChange)
    }, [])

    const setThemePreference = (preference: ThemePreference): void => {
        setThemePreferenceState(preference)
        writeThemePreference(globalThis.localStorage, preference)
    }

    const setLanguagePreference = (preference: LanguagePreference): void => {
        setLanguagePreferenceState(preference)
        writeLanguagePreference(globalThis.localStorage, preference)
    }

    return {
        language: resolveLanguagePreference(languagePreference, systemLanguage),
        languagePreference,
        setLanguagePreference,
        setThemePreference,
        themeMode: resolveThemePreference(themePreference, systemTheme),
        themePreference,
    }
}
