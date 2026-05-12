import { type RefObject, useEffect } from 'react'

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
        return !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
    })
}

function focusInitialElement(root: HTMLElement): void {
    const target = getFocusableElements(root)[0] ?? root
    target.focus()
}

function trapTabKey(root: HTMLElement, event: KeyboardEvent): void {
    const elements = getFocusableElements(root)
    if (elements.length === 0) {
        event.preventDefault()
        root.focus()
        return
    }

    const first = elements[0]
    const last = elements[elements.length - 1]
    const active = document.activeElement

    if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
        return
    }
    if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
    }
}

export function useModalFocusTrap(rootRef: RefObject<HTMLElement | null>, onEscape: () => void): void {
    useEffect(() => {
        const root = rootRef.current
        if (!root) return

        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
        focusInitialElement(root)

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                event.preventDefault()
                onEscape()
                return
            }
            if (event.key === 'Tab' && root) {
                trapTabKey(root, event)
            }
        }

        document.addEventListener('keydown', handleKeyDown, true)
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true)
            if (previousFocus?.isConnected) {
                previousFocus.focus()
            }
        }
    }, [onEscape, rootRef])
}
