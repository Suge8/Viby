import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { Spinner } from './Spinner'

describe('Spinner', () => {
    it('falls back to a plain loading label when no I18nProvider is mounted', () => {
        render(<Spinner />)

        expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading')
    })

    it('stays decorative when callers explicitly pass a null label', () => {
        const { container } = render(
            <I18nProvider>
                <Spinner label={null} />
            </I18nProvider>
        )

        expect(within(container).queryByRole('status')).not.toBeInTheDocument()
        expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    })
})
