import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { RouteLoadingFallback } from './RouteLoadingFallback'

describe('RouteLoadingFallback', () => {
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

    it('omits the long workspace description unless explicitly requested', async () => {
        const { container } = render(
            <I18nProvider>
                <RouteLoadingFallback />
            </I18nProvider>
        )

        await waitFor(() => {
            expect(container.querySelector('[data-testid="loading-state-hero"]')).toBeInTheDocument()
        })
        expect(screen.queryByText('Chat, files, and live updates will pick up in a moment.')).not.toBeInTheDocument()
    })

    it('renders the runtime presentation for new-session runtime probing', async () => {
        render(
            <I18nProvider>
                <RouteLoadingFallback kind="runtime" />
            </I18nProvider>
        )

        await waitFor(() => {
            expect(screen.getByText('Loading local runtime…')).toBeInTheDocument()
        })
    })

    it('supports inline variant for nested detail transitions', () => {
        const { container } = render(
            <I18nProvider>
                <RouteLoadingFallback variant="inline" />
            </I18nProvider>
        )

        expect(screen.getByText('Preparing your workspace…')).toBeInTheDocument()
        expect(container.querySelector('[data-testid="loading-state-hero"]')).toBeNull()
    })
})
