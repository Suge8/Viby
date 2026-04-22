export const APP_OVERLAY_ROOT_ELEMENT_ID = 'app-overlays'

export function ensureAppOverlayRoot(): HTMLElement | null {
    if (typeof document === 'undefined') {
        return null
    }

    const existingElement = document.getElementById(APP_OVERLAY_ROOT_ELEMENT_ID)
    if (existingElement) {
        return existingElement
    }

    const overlayRoot = document.createElement('div')
    overlayRoot.id = APP_OVERLAY_ROOT_ELEMENT_ID
    document.body.appendChild(overlayRoot)
    return overlayRoot
}
