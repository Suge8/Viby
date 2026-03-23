import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
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
    }) => (
        <button
            type="button"
            aria-label={ariaLabel}
            title={title}
            disabled={disabled}
            className={className}
        />
    )
}))

function renderComposerButtons() {
    return render(
        <I18nProvider>
            <ComposerButtons
                attachmentsSupported
                attachmentDisabled={false}
                controlsButton={{
                    visible: true,
                    disabled: false,
                    active: true,
                    onToggle: vi.fn()
                }}
                primaryAction={{
                    mode: 'stop',
                    disabled: false,
                    busy: false,
                    onClick: vi.fn()
                }}
            />
        </I18nProvider>
    )
}

describe('ComposerButtons', () => {
    afterEach(() => {
        cleanup()
    })

    it('uses the primary button as the stop action while a run is active', () => {
        renderComposerButtons()

        expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Abort' })).not.toBeInTheDocument()
    })

    it('renders the compact controls button next to attachments', () => {
        renderComposerButtons()

        const stopButton = screen.getByRole('button', { name: 'Stop' })
        const controlsButton = screen.getByRole('button', { name: 'Controls' })

        expect(screen.getAllByRole('button', { name: 'Attach file' }).length).toBeGreaterThan(0)
        expect(controlsButton).toHaveAttribute('data-button-press-style', 'button')
        expect(controlsButton).toHaveAttribute('data-button-pointer-effect', 'default')
        expect(stopButton).toHaveAttribute('data-button-press-style', 'button')
        expect(stopButton).toHaveAttribute('data-button-pointer-effect', 'default')
    })

    it('uses a stopping label while an abort request is in flight', () => {
        render(
            <I18nProvider>
                <ComposerButtons
                    attachmentsSupported
                    attachmentDisabled={false}
                    controlsButton={{
                        visible: true,
                        disabled: false,
                        active: true,
                        onToggle: vi.fn()
                    }}
                    primaryAction={{
                        mode: 'stop',
                        disabled: true,
                        busy: true,
                        onClick: vi.fn()
                    }}
                />
            </I18nProvider>
        )

        expect(screen.getByRole('button', { name: 'Stopping' })).toBeInTheDocument()
    })
})
