import { en } from './locales'
import type { Locale, Translations } from './i18n-context'

const defaultTranslations: Translations = en

const translationCache = new Map<Locale, Translations>([
    ['en', defaultTranslations]
])

async function loadZhCNTranslations(): Promise<Translations> {
    const module = await import('./locales/zh-CN')
    return module.default
}

const localeLoaders: Record<Locale, () => Promise<Translations>> = {
    en: async () => defaultTranslations,
    'zh-CN': loadZhCNTranslations
}

export function getCachedTranslations(locale: Locale): Translations | null {
    return translationCache.get(locale) ?? null
}

export async function preloadTranslations(locale: Locale): Promise<Translations> {
    const cached = getCachedTranslations(locale)
    if (cached) {
        return cached
    }

    const translations = await localeLoaders[locale]()
    translationCache.set(locale, translations)
    return translations
}
