import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSIENT_EDITABLE_ATTRIBUTE } from '@/lib/domAttributes'
import { safeCopyToClipboard } from './clipboard'

describe('safeCopyToClipboard', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        Object.defineProperty(window, 'isSecureContext', {
            configurable: true,
            value: true
        })
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: undefined
        })
        Object.defineProperty(document, 'execCommand', {
            configurable: true,
            writable: true,
            value: vi.fn(() => false)
        })
    })

    it('uses navigator clipboard writeText when available', async () => {
        const writeText = vi.fn(async () => {})
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText }
        })
        const execCommand = vi.mocked(document.execCommand)
        execCommand.mockReturnValue(true)

        await safeCopyToClipboard('hello')

        expect(writeText).toHaveBeenCalledWith('hello')
        expect(execCommand).not.toHaveBeenCalled()
    })

    it('falls back to execCommand when clipboard api write fails', async () => {
        const writeText = vi.fn(async () => {
            throw new Error('clipboard denied')
        })
        Object.defineProperty(window, 'isSecureContext', {
            configurable: true,
            value: true
        })
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText }
        })
        const execCommand = vi.mocked(document.execCommand)
        execCommand.mockReturnValue(true)

        await safeCopyToClipboard('fallback')

        expect(writeText).toHaveBeenCalledWith('fallback')
        expect(execCommand).toHaveBeenCalledWith('copy')
    })

    it('skips async clipboard on non-secure contexts and uses execCommand directly', async () => {
        const writeText = vi.fn(async () => {})
        Object.defineProperty(window, 'isSecureContext', {
            configurable: true,
            value: false
        })
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText }
        })
        const execCommand = vi.mocked(document.execCommand)
        execCommand.mockReturnValue(true)

        await safeCopyToClipboard('local-http')

        expect(writeText).not.toHaveBeenCalled()
        expect(execCommand).toHaveBeenCalledWith('copy')
    })

    it('throws when both modern and legacy copy strategies fail', async () => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: undefined
        })
        const execCommand = vi.mocked(document.execCommand)
        execCommand.mockReturnValue(false)

        await expect(safeCopyToClipboard('x')).rejects.toThrow('Copy to clipboard failed')
    })

    it('uses preventScroll focus and marks the fallback textarea as transient', async () => {
        const execCommand = vi.mocked(document.execCommand)
        execCommand.mockReturnValue(true)

        const originalCreateElement = document.createElement.bind(document)
        let createdTextarea: HTMLTextAreaElement | null = null
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
            const element = originalCreateElement(tagName, options)
            if (tagName === 'textarea' && element instanceof HTMLTextAreaElement) {
                createdTextarea = element
            }
            return element
        }) as typeof document.createElement)

        const textareaFocusSpy = vi
            .spyOn(HTMLTextAreaElement.prototype, 'focus')
            .mockImplementation(() => undefined)

        const activeButton = document.createElement('button')
        const buttonFocusSpy = vi.fn()
        activeButton.focus = buttonFocusSpy as typeof activeButton.focus
        Object.defineProperty(document, 'activeElement', {
            configurable: true,
            get: () => activeButton
        })

        await safeCopyToClipboard('focus-stable')

        expect(createdTextarea).not.toBeNull()
        if (!createdTextarea) {
            throw new Error('Expected clipboard fallback textarea to be created')
        }
        const textarea = createdTextarea as unknown as HTMLTextAreaElement
        expect(textareaFocusSpy).toHaveBeenCalledWith({ preventScroll: true })
        expect(buttonFocusSpy).toHaveBeenCalledWith({ preventScroll: true })
        expect(textarea.getAttribute(TRANSIENT_EDITABLE_ATTRIBUTE)).toBe('true')
    })
})
