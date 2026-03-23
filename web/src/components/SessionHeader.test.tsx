import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { SessionHeader } from './SessionHeader'

type SessionHeaderRenderOptions = {
    onViewFiles?: () => void
    onViewTerminal?: () => void
}

function renderHeader(options?: SessionHeaderRenderOptions): void {
    render(
        <I18nProvider>
            <SessionHeader
                session={{
                    id: 'session-1',
                    active: true,
                    thinking: false,
                    permissionMode: 'default',
                    collaborationMode: 'default',
                    model: 'gpt-5.4',
                    modelReasoningEffort: null,
                    metadata: {
                        flavor: 'codex'
                    }
                } as never}
                navigation={{
                    onBack: vi.fn(),
                    onViewFiles: options?.onViewFiles,
                    onViewTerminal: options?.onViewTerminal
                }}
            />
        </I18nProvider>
    )
}

describe('SessionHeader', () => {
    afterEach(() => {
        cleanup()
    })

    it('hides the neutral awaiting-input badge for running idle sessions', () => {
        renderHeader()

        expect(screen.queryByText('Awaiting input')).not.toBeInTheDocument()
    })

    it('does not render lifecycle or processing badges in the detail header', () => {
        renderHeader()

        expect(screen.queryByText('Working')).not.toBeInTheDocument()
        expect(screen.queryByText('Closed')).not.toBeInTheDocument()
        expect(screen.queryByText('Archived')).not.toBeInTheDocument()
        expect(screen.queryByTestId('session-header-state-row')).not.toBeInTheDocument()
    })

    it('centers the session title inside the compact mobile header panel', () => {
        renderHeader()

        expect(screen.getAllByText('session-')[0]).toHaveClass('text-center')
    })

    it('shows the friendly agent brand label instead of the raw flavor', () => {
        renderHeader()

        expect(screen.getByText('Codex')).toBeInTheDocument()
        expect(screen.queryByText('codex')).not.toBeInTheDocument()
    })

    it('moves files and terminal actions into the more menu', () => {
        const onViewFiles = vi.fn()
        const onViewTerminal = vi.fn()
        renderHeader({ onViewFiles, onViewTerminal })

        expect(screen.queryByRole('button', { name: 'Files' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Terminal' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByTitle('More actions'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Files' }))
        expect(onViewFiles).toHaveBeenCalledOnce()

        fireEvent.click(screen.getByTitle('More actions'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Terminal' }))
        expect(onViewTerminal).toHaveBeenCalledOnce()
    })

    it('hides the more button when chat navigation actions are unavailable', () => {
        renderHeader()

        expect(screen.queryByTitle('More actions')).not.toBeInTheDocument()
    })
})
