import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import { getCachedTranslations, preloadTranslations } from './i18nCatalog'

export type Locale = 'en' | 'zh-CN'
export type LocalePreference = Locale | 'system'

export type Translations = Record<string, string>

export type I18nContextValue = {
    t: (key: string, params?: Record<string, string | number>) => string
    locale: Locale
    localePreference: LocalePreference
    setLocale: (locale: LocalePreference) => void
}

export const I18nContext = createContext<I18nContextValue | null>(null)

const LEGACY_LOCALE_STORAGE_KEY = 'viby-lang'
const LOCALE_PREFERENCE_STORAGE_KEY = 'viby-lang-preference'
const EMPTY_TRANSLATIONS: Translations = {}

function isLocale(value: string | null): value is Locale {
    return value === 'en' || value === 'zh-CN'
}

function isLocalePreference(value: string | null): value is LocalePreference {
    return value === 'system' || isLocale(value)
}

export function detectPreferredLocale(): Locale {
    if (typeof navigator === 'undefined') {
        return 'en'
    }

    const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language]
    const matchedChinese = browserLanguages.some((language) => language.toLowerCase().startsWith('zh'))
    return matchedChinese ? 'zh-CN' : 'en'
}

export function resolveLocale(localePreference: LocalePreference): Locale {
    return localePreference === 'system' ? detectPreferredLocale() : localePreference
}

export function readStoredLocalePreference(): LocalePreference {
    if (typeof localStorage === 'undefined') {
        return 'system'
    }

    const storedPreference = localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY)
    if (isLocalePreference(storedPreference)) {
        return storedPreference
    }

    const legacyLocale = localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY)
    return isLocale(legacyLocale) ? legacyLocale : 'system'
}

export function resolveInitialLocale(): Locale {
    return resolveLocale(readStoredLocalePreference())
}

function persistLocalePreference(localePreference: LocalePreference): void {
    if (typeof localStorage === 'undefined') {
        return
    }

    localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, localePreference)
    if (localePreference === 'system') {
        localStorage.removeItem(LEGACY_LOCALE_STORAGE_KEY)
        return
    }

    localStorage.setItem(LEGACY_LOCALE_STORAGE_KEY, localePreference)
}

function interpolate(str: string, params?: Record<string, string | number>): string {
    if (!params) return str

    return str.replace(/\{(\w+)\}/g, (match, key) => {
        const value = params[key]
        return value !== undefined ? String(value) : match
    })
}

export function I18nProvider({ children }: { children: ReactNode }) {
    const [localePreference, setLocalePreference] = useState<LocalePreference>(() => readStoredLocalePreference())
    const [systemLocale, setSystemLocale] = useState<Locale>(() => detectPreferredLocale())
    const locale = localePreference === 'system' ? systemLocale : localePreference
    const [translations, setTranslations] = useState<Translations>(() => {
        return getCachedTranslations(locale) ?? EMPTY_TRANSLATIONS
    })

    const setLocale = useCallback((nextLocalePreference: LocalePreference) => {
        persistLocalePreference(nextLocalePreference)
        setLocalePreference(nextLocalePreference)
    }, [])

    const t = useCallback((key: string, params?: Record<string, string | number>): string => {
        const value = translations[key]
        return interpolate(value ?? key, params)
    }, [translations])

    useEffect(() => {
        document.documentElement.lang = locale
    }, [locale])

    useEffect(() => {
        const cached = getCachedTranslations(locale)
        if (cached) {
            setTranslations(cached)
            return
        }

        let cancelled = false
        void preloadTranslations(locale).then((nextTranslations) => {
            if (!cancelled) {
                setTranslations(nextTranslations)
            }
        })
        return () => {
            cancelled = true
        }
    }, [locale])

    useEffect(() => {
        if (localePreference !== 'system' || typeof window === 'undefined') {
            return
        }

        function handleLanguageChange(): void {
            setSystemLocale(resolveLocale('system'))
        }

        handleLanguageChange()
        window.addEventListener('languagechange', handleLanguageChange)
        return () => {
            window.removeEventListener('languagechange', handleLanguageChange)
        }
    }, [localePreference])

    return (
        <I18nContext.Provider value={{ t, locale, localePreference, setLocale }}>
            {children}
        </I18nContext.Provider>
    )
}
