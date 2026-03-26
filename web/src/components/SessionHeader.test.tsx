import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithI18n } from '@/test/i18n'
import { SessionHeader } from './SessionHeader'

type SessionHeaderRenderOptions = {
    onViewFiles?: () => void
    onViewTerminal?: () => void
}

function getMoreButton(): HTMLElement {
    return screen.getByTitle(/^(session\.more|More actions)$/i)
}

async function renderHeader(options?: SessionHeaderRenderOptions) {
    return renderWithI18n(
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
    )
}

describe('SessionHeader', () => {
    afterEach(() => {
        cleanup()
    })

    it('hides the neutral awaiting-input badge for running idle sessions', async () => {
        await renderHeader()

        expect(screen.queryByText('Awaiting input')).not.toBeInTheDocument()
    })

    it('does not render lifecycle or processing badges in the detail header', async () => {
        await renderHeader()

        expect(screen.queryByText('Working')).not.toBeInTheDocument()
        expect(screen.queryByText('Closed')).not.toBeInTheDocument()
        expect(screen.queryByText('Archived')).not.toBeInTheDocument()
        expect(screen.queryByTestId('session-header-state-row')).not.toBeInTheDocument()
    })

    it('centers the session title inside the compact mobile header panel', async () => {
        await renderHeader()

        expect(screen.getAllByText('session-')[0]).toHaveClass('text-center')
    })

    it('shows the friendly agent brand label instead of the raw flavor', async () => {
        await renderHeader()

        expect(screen.getByText('Codex')).toBeInTheDocument()
        expect(screen.queryByText('codex')).not.toBeInTheDocument()
    })

    it('moves files and terminal actions into the more menu', async () => {
        const onViewFiles = vi.fn()
        const onViewTerminal = vi.fn()
        await renderHeader({ onViewFiles, onViewTerminal })

        expect(screen.queryByRole('button', { name: 'Files' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Terminal' })).not.toBeInTheDocument()

        fireEvent.click(getMoreButton())
        return screen.findByRole('menuitem', { name: 'Files' }).then((filesMenuItem) => {
            fireEvent.click(filesMenuItem)
            expect(onViewFiles).toHaveBeenCalledOnce()

            fireEvent.click(getMoreButton())
            return screen.findByRole('menuitem', { name: 'Terminal' }).then((terminalMenuItem) => {
                fireEvent.click(terminalMenuItem)
                expect(onViewTerminal).toHaveBeenCalledOnce()
            })
        })
    })

    it('hides the more button when chat navigation actions are unavailable', async () => {
        await renderHeader()

        expect(screen.queryByTitle(/^(session\.more|More actions)$/i)).not.toBeInTheDocument()
    })
})
