import { useContext } from 'react'
import { I18nContext } from './i18n-context'

export type { I18nContextValue, Locale, LocalePreference } from './i18n-context'

export function useTranslation(): import('./i18n-context').I18nContextValue {
    const context = useContext(I18nContext)
    if (!context) {
        throw new Error('useTranslation must be used within I18nProvider')
    }

    return context
}
