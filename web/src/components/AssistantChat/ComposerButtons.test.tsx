import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPOSER_CONTROLS_BUTTON_TEST_ID, COMPOSER_PRIMARY_ACTION_BUTTON_TEST_ID } from '@/lib/sessionUiContracts'
import { renderWithI18n } from '@/test/i18n'
import { ComposerButtons } from './ComposerButtons'

vi.mock('@/components/AssistantChat/ComposerAttachmentButton', () => ({
    ComposerAttachmentButton: ({
        ariaLabel,
        title,
        disabled,
        className,
    }: {
        ariaLabel: string
        title: string
        disabled: boolean
        className?: string
    }) => <button type="button" aria-label={ariaLabel} title={title} disabled={disabled} className={className} />,
}))

function buildComposerButtons(props?: {
    primaryAction?: {
        mode: 'send' | 'stop'
        disabled: boolean
        busy: boolean
        onClick: () => void
    }
}) {
    return (
        <ComposerButtons
            attachmentsSupported
            attachmentDisabled={false}
            controlsButton={{
                visible: true,
                disabled: false,
                active: true,
                onToggle: vi.fn(),
            }}
            primaryAction={
                props?.primaryAction ?? {
                    mode: 'stop',
                    disabled: false,
                    busy: false,
                    onClick: vi.fn(),
                }
            }
        />
    )
}

async function renderComposerButtons() {
    return renderWithI18n(buildComposerButtons())
}

describe('ComposerButtons', () => {
    afterEach(() => {
        cleanup()
    })

    it('uses the primary button as the stop action while a run is active', async () => {
        await renderComposerButtons()

        expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Abort' })).not.toBeInTheDocument()
    })

    it('renders the compact controls button next to attachments', async () => {
        await renderComposerButtons()

        const stopButton = screen.getByRole('button', { name: 'Stop' })
        const controlsButton = screen.getByRole('button', { name: 'Settings' })

        expect(screen.getAllByRole('button', { name: 'Attach file' }).length).toBeGreaterThan(0)
        expect(controlsButton).toHaveAttribute('data-testid', COMPOSER_CONTROLS_BUTTON_TEST_ID)
        expect(controlsButton).toHaveAttribute('data-button-press-style', 'button')
        expect(controlsButton).toHaveAttribute('data-button-pointer-effect', 'default')
        expect(stopButton).toHaveAttribute('data-button-press-style', 'button')
        expect(stopButton).toHaveAttribute('data-button-pointer-effect', 'default')
        expect(stopButton).toHaveAttribute('data-testid', COMPOSER_PRIMARY_ACTION_BUTTON_TEST_ID)
    })

    it('uses a stopping label while an abort request is in flight', async () => {
        await renderWithI18n(
            buildComposerButtons({
                primaryAction: {
                    mode: 'stop',
                    disabled: true,
                    busy: true,
                    onClick: vi.fn(),
                },
            })
        )

        expect(screen.getByRole('button', { name: 'Stopping' })).toBeInTheDocument()
    })
})
