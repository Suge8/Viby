import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { ComposerAttachmentButton } from './ComposerAttachmentButton'

const harness = vi.hoisted(() => ({
    addAttachment: vi.fn().mockResolvedValue(undefined),
    attachmentAccept: 'image/*'
}))

vi.mock('@assistant-ui/react', () => ({
    useAssistantApi: () => ({
        composer: () => ({
            addAttachment: harness.addAttachment
        })
    }),
    useAssistantState: (selector: (state: { composer: { attachmentAccept: string } }) => string) => selector({
        composer: { attachmentAccept: harness.attachmentAccept }
    })
}))

describe('ComposerAttachmentButton', () => {
    afterEach(() => {
        cleanup()
    })

    it('renders a persistent hidden file input with the runtime accept filter', () => {
        harness.attachmentAccept = 'image/*'
        const { container } = render(
            <I18nProvider>
                <ComposerAttachmentButton
                    disabled={false}
                    ariaLabel="Attach file"
                    title="Attach file"
                    className="test-button"
                />
            </I18nProvider>
        )

        const input = container.querySelector('input[type="file"]') as HTMLInputElement | null
        const button = container.querySelector('button') as HTMLButtonElement | null
        expect(input).not.toBeNull()
        expect(button).not.toBeNull()
        expect(button?.type).toBe('button')
        expect(button).toHaveAttribute('data-button-press-style', 'button')
        expect(button).toHaveAttribute('data-button-pointer-effect', 'default')
        expect(input?.accept).toBe('image/*')
        expect(input?.multiple).toBe(true)
    })

    it('falls back to an explicit mobile-safe accept list when the runtime exposes a wildcard', () => {
        harness.attachmentAccept = '*/*'

        const { container } = render(
            <I18nProvider>
                <ComposerAttachmentButton
                    disabled={false}
                    ariaLabel="Attach file"
                    title="Attach file"
                    className="test-button"
                />
            </I18nProvider>
        )

        const input = container.querySelector('input[type="file"]') as HTMLInputElement | null
        expect(input?.accept).toContain('image/*')
        expect(input?.accept).toContain('.heic')
        expect(input?.accept).toContain('application/pdf')
    })

    it('adds every selected file through the assistant runtime', async () => {
        harness.addAttachment.mockClear()
        harness.attachmentAccept = 'image/*'

        const { container } = render(
            <I18nProvider>
                <ComposerAttachmentButton
                    disabled={false}
                    ariaLabel="Attach file"
                    title="Attach file"
                    className="test-button"
                />
            </I18nProvider>
        )

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        const image = new File(['image'], 'photo.png', { type: 'image/png' })
        const text = new File(['text'], 'note.txt', { type: 'text/plain' })

        fireEvent.change(input, {
            target: {
                files: [image, text]
            }
        })

        await waitFor(() => {
            expect(harness.addAttachment).toHaveBeenCalledTimes(2)
        })

        expect(harness.addAttachment).toHaveBeenNthCalledWith(1, image)
        expect(harness.addAttachment).toHaveBeenNthCalledWith(2, text)
    })

    it('prefers showPicker when the browser exposes it', () => {
        harness.attachmentAccept = 'image/*'

        const { container } = render(
            <I18nProvider>
                <ComposerAttachmentButton
                    disabled={false}
                    ariaLabel="Attach file"
                    title="Attach file"
                    className="test-button"
                />
            </I18nProvider>
        )

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        const button = container.querySelector('button') as HTMLButtonElement
        const showPicker = vi.fn()
        Object.assign(input, { showPicker })

        fireEvent.click(button)

        expect(showPicker).toHaveBeenCalledTimes(1)
    })

    it('falls back to input.click when showPicker throws', () => {
        harness.attachmentAccept = 'image/*'

        const { container } = render(
            <I18nProvider>
                <ComposerAttachmentButton
                    disabled={false}
                    ariaLabel="Attach file"
                    title="Attach file"
                    className="test-button"
                />
            </I18nProvider>
        )

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        const button = container.querySelector('button') as HTMLButtonElement
        const click = vi.fn()
        const showPicker = vi.fn(() => {
            throw new Error('not allowed')
        })

        Object.assign(input, { showPicker, click })

        fireEvent.click(button)

        expect(showPicker).toHaveBeenCalledTimes(1)
        expect(click).toHaveBeenCalledTimes(1)
    })
})
