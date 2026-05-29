import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { RemotePairingCodeScreen, RemotePairingStatusScreen } from './RemotePairingScreens'

function renderWithI18n(element: ReactElement): void {
    render(<I18nProvider>{element}</I18nProvider>)
}

describe('RemotePairingScreens', () => {
    it('renders cold remote reconnect with a pairing-specific connecting surface', async () => {
        renderWithI18n(<RemotePairingStatusScreen message={null} onRetry={vi.fn()} />)

        expect(await screen.findByRole('heading', { name: 'Connecting to your computer' })).toBeInTheDocument()
        expect(screen.getByRole('progressbar')).toBeInTheDocument()
        expect(screen.getByText('Waking Viby')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument()
    })

    it('renders the connecting surface with the active phase step', async () => {
        renderWithI18n(<RemotePairingStatusScreen message={null} phase="loading-workspace" />)

        expect(screen.getByText('Putting your sessions where you left them')).toBeInTheDocument()
    })

    it('renders retryable errors with one explicit retry action', async () => {
        const onRetry = vi.fn()
        renderWithI18n(<RemotePairingStatusScreen message="Computer offline" onRetry={onRetry} />)

        expect(await screen.findByRole('heading', { name: 'Reconnect your computer' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
        expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('renders final scan-again errors without a dead-end retry action', async () => {
        renderWithI18n(<RemotePairingStatusScreen message="Scan the QR code again" />)

        expect(await screen.findByText('Scan the QR code again')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument()
    })

    it('submits only the normalized six digit code', async () => {
        const onSubmit = vi.fn()
        renderWithI18n(<RemotePairingCodeScreen submitting={false} onSubmit={onSubmit} />)

        const input = await screen.findByLabelText('6-digit code from your computer')
        fireEvent.change(input, { target: { value: '12a3456' } })
        fireEvent.click(screen.getByRole('button', { name: 'Pair' }))

        expect(onSubmit).toHaveBeenCalledWith('123456')
    })
})
