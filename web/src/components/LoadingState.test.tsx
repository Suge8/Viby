import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { LoadingState } from './LoadingState'

describe('LoadingState', () => {
    it('renders inline busy copy without the route hero chrome', () => {
        render(
            <I18nProvider>
                <LoadingState label="Loading session…" />
            </I18nProvider>
        )

        expect(screen.getByRole('status')).toHaveTextContent('Loading session…')
        expect(screen.queryByTestId('loading-state-hero')).not.toBeInTheDocument()
    })

    it('renders a lightweight route hero with icon and optional description', () => {
        render(
            <I18nProvider>
                <LoadingState
                    label="Preparing your workspace…"
                    description="Chat, files, and live updates will pick up here."
                    icon={<span data-testid="custom-loading-icon" />}
                    variant="panel"
                />
            </I18nProvider>
        )

        expect(screen.getByTestId('loading-state-hero')).toHaveTextContent('Preparing your workspace…')
        expect(screen.getByText('Chat, files, and live updates will pick up here.')).toBeInTheDocument()
        expect(screen.getByTestId('custom-loading-icon')).toBeInTheDocument()
    })
})
