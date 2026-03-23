import { TRANSIENT_EDITABLE_ATTRIBUTE } from '@/lib/domAttributes'

const CLIPBOARD_COPY_ERROR_MESSAGE = 'Copy to clipboard failed'
const CLIPBOARD_BUFFER_STYLE = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 1px',
    'height: 1px',
    'padding: 0',
    'border: 0',
    'opacity: 0',
    'pointer-events: none'
].join('; ')

function focusElementWithoutScroll(element: HTMLElement): void {
    try {
        element.focus({ preventScroll: true })
    } catch {
        element.focus()
    }
}

function copyWithExecCommand(text: string): boolean {
    if (typeof document === 'undefined' || !document.body) {
        return false
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.setAttribute('aria-hidden', 'true')
    textarea.setAttribute('tabindex', '-1')
    textarea.setAttribute(TRANSIENT_EDITABLE_ATTRIBUTE, 'true')
    textarea.style.cssText = CLIPBOARD_BUFFER_STYLE

    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const selection = document.getSelection()
    const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    document.body.appendChild(textarea)
    focusElementWithoutScroll(textarea)
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)

    let copied = false
    try {
        copied = document.execCommand('copy')
    } catch {
        copied = false
    } finally {
        document.body.removeChild(textarea)
        if (selection) {
            selection.removeAllRanges()
            if (previousRange) {
                selection.addRange(previousRange)
            }
        }
        if (activeElement) {
            focusElementWithoutScroll(activeElement)
        }
    }

    return copied
}

function canUseAsyncClipboardApi(): boolean {
    if (typeof window === 'undefined') {
        return false
    }

    if (window.isSecureContext !== true) {
        return false
    }

    return typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
}

export async function safeCopyToClipboard(text: string): Promise<void> {
    if (canUseAsyncClipboardApi()) {
        try {
            await navigator.clipboard.writeText(text)
            return
        } catch {
            // Fall through to legacy copy strategy.
        }
    }

    if (copyWithExecCommand(text)) {
        return
    }

    throw new Error(CLIPBOARD_COPY_ERROR_MESSAGE)
}
