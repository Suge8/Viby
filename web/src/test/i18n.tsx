import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { I18nProvider, resolveInitialLocale, type Locale } from '@/lib/i18n-context'
import { preloadTranslations } from '@/lib/i18nCatalog'

type RenderWithI18nOptions = Omit<RenderOptions, 'wrapper'> & {
    locale?: Locale
}

export async function preloadI18nForTests(locale = resolveInitialLocale()): Promise<void> {
    await preloadTranslations(locale)
}

export async function renderWithI18n(
    ui: ReactElement,
    options?: RenderWithI18nOptions
): Promise<RenderResult> {
    await preloadI18nForTests(options?.locale)
    return render(<I18nProvider>{ui}</I18nProvider>, options)
}

export function I18nTestWrapper(props: { children: ReactNode }): React.JSX.Element {
    return <I18nProvider>{props.children}</I18nProvider>
}
