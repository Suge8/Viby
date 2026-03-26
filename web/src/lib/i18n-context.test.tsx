import { type JSX } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider, detectPreferredLocale } from './i18n-context'
import { useTranslation } from './use-translation'

function LocaleProbe(): JSX.Element {
    const { locale } = useTranslation()
    return <div>{locale}</div>
}

function TranslationProbe(): JSX.Element {
    const { t } = useTranslation()
    return <div>{t('login.submit')}</div>
}

describe('i18n locale detection', () => {
    const originalLanguage = navigator.language
    const originalLanguages = navigator.languages

    beforeEach(() => {
        window.localStorage.clear()
    })

    afterEach(() => {
        cleanup()
        Object.defineProperty(window.navigator, 'language', {
            configurable: true,
            value: originalLanguage
        })
        Object.defineProperty(window.navigator, 'languages', {
            configurable: true,
            value: originalLanguages
        })
        window.localStorage.clear()
    })

    it('prefers zh-CN when browser language is Chinese', () => {
        Object.defineProperty(window.navigator, 'language', {
            configurable: true,
            value: 'zh-CN'
        })
        Object.defineProperty(window.navigator, 'languages', {
            configurable: true,
            value: ['zh-CN', 'en-US']
        })

        expect(detectPreferredLocale()).toBe('zh-CN')
    })

    it('uses detected browser locale when no saved locale exists', () => {
        Object.defineProperty(window.navigator, 'language', {
            configurable: true,
            value: 'zh-CN'
        })
        Object.defineProperty(window.navigator, 'languages', {
            configurable: true,
            value: ['zh-CN', 'en-US']
        })

        render(
            <I18nProvider>
                <LocaleProbe />
            </I18nProvider>
        )

        expect(screen.getByText('zh-CN')).toBeInTheDocument()
    })

    it('still honors an explicit saved locale over browser locale', () => {
        window.localStorage.setItem('viby-lang-preference', 'en')
        Object.defineProperty(window.navigator, 'language', {
            configurable: true,
            value: 'zh-CN'
        })
        Object.defineProperty(window.navigator, 'languages', {
            configurable: true,
            value: ['zh-CN', 'en-US']
        })

        render(
            <I18nProvider>
                <LocaleProbe />
            </I18nProvider>
        )

        expect(screen.getByText('en')).toBeInTheDocument()
    })

    it('supports migrating the legacy locale key', () => {
        window.localStorage.setItem('viby-lang', 'zh-CN')

        render(
            <I18nProvider>
                <LocaleProbe />
            </I18nProvider>
        )

        expect(screen.getByText('zh-CN')).toBeInTheDocument()
    })

    it('updates locale when browser language changes under system preference', async () => {
        Object.defineProperty(window.navigator, 'language', {
            configurable: true,
            value: 'en-US'
        })
        Object.defineProperty(window.navigator, 'languages', {
            configurable: true,
            value: ['en-US']
        })

        render(
            <I18nProvider>
                <LocaleProbe />
            </I18nProvider>
        )

        expect(screen.getByText('en')).toBeInTheDocument()

        Object.defineProperty(window.navigator, 'language', {
            configurable: true,
            value: 'zh-CN'
        })
        Object.defineProperty(window.navigator, 'languages', {
            configurable: true,
            value: ['zh-CN', 'en-US']
        })
        window.dispatchEvent(new Event('languagechange'))

        await waitFor(() => {
            expect(screen.getByText('zh-CN')).toBeInTheDocument()
        })
    })

    it('loads zh-CN translations on demand when the saved locale prefers Chinese', async () => {
        window.localStorage.setItem('viby-lang-preference', 'zh-CN')

        render(
            <I18nProvider>
                <TranslationProbe />
            </I18nProvider>
        )

        await waitFor(() => {
            expect(screen.getByText('登录')).toBeInTheDocument()
        })
    })

    it('loads English translations on demand when bootstrap cache is cold', async () => {
        render(
            <I18nProvider>
                <TranslationProbe />
            </I18nProvider>
        )

        await waitFor(() => {
            expect(screen.getByText('Sign In')).toBeInTheDocument()
        })
    })
})
