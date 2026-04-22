import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { RouteLoadingFallback } from './RouteLoadingFallback'

describe('RouteLoadingFallback', () => {
    it('renders the route hero copy for file routes without the long workspace description', async () => {
        const { container } = render(
            <I18nProvider>
                <RouteLoadingFallback kind="files" />
            </I18nProvider>
        )

        await waitFor(() => {
            expect(container.querySelector('[data-testid="loading-state-hero"]')).toHaveTextContent('Loading files…')
        })
        expect(screen.queryByText('Chat, files, and live updates will pick up in a moment.')).not.toBeInTheDocument()
    })

    it('defaults to the workspace presentation when no kind is provided', async () => {
        const { container } = render(
            <I18nProvider>
                <RouteLoadingFallback />
            </I18nProvider>
        )

        await waitFor(() => {
            expect(container.querySelector('[data-testid="loading-state-hero"]')).toHaveTextContent(
                'Preparing your workspace…'
            )
        })
    })

    it('supports inline route fallback for nested detail transitions', () => {
        const { container } = render(
            <I18nProvider>
                <RouteLoadingFallback kind="terminal" variant="inline" />
            </I18nProvider>
        )

        expect(screen.getByText('Loading terminal…')).toBeInTheDocument()
        expect(container.querySelector('[data-testid="loading-state-hero"]')).toBeNull()
    })
})
