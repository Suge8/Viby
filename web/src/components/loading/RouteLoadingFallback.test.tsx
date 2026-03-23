import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { RouteLoadingFallback } from './RouteLoadingFallback'

describe('RouteLoadingFallback', () => {
    it('renders the route hero copy for file routes without the long workspace description', () => {
        const { container } = render(
            <I18nProvider>
                <RouteLoadingFallback kind="files" />
            </I18nProvider>
        )

        expect(container.querySelector('[data-testid="loading-state-hero"]')).toHaveTextContent('Loading files…')
        expect(screen.queryByText('Chat, files, and live updates will pick up in a moment.')).not.toBeInTheDocument()
    })

    it('defaults to the workspace presentation when no kind is provided', () => {
        const { container } = render(
            <I18nProvider>
                <RouteLoadingFallback />
            </I18nProvider>
        )

        expect(container.querySelector('[data-testid="loading-state-hero"]')).toHaveTextContent('Preparing your workspace…')
    })

    it('can render the authorizing description through the shared blocking fallback', () => {
        render(
            <I18nProvider>
                <RouteLoadingFallback kind="authorizing" withDescription testId="authorizing-fallback" />
            </I18nProvider>
        )

        expect(screen.getByTestId('authorizing-fallback')).toHaveTextContent('Authorizing…')
        expect(screen.getByText('Restoring your sign-in and reconnecting to the current hub.')).toBeInTheDocument()
    })
})
