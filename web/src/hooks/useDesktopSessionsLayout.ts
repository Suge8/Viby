import { useSyncExternalStore } from 'react'

const DESKTOP_LAYOUT_MEDIA_QUERY = '(min-width: 1024px)'

function subscribeDesktopLayoutChange(onStoreChange: () => void): () => void {
    if (typeof window === 'undefined') {
        return () => {}
    }

    const mediaQuery = window.matchMedia(DESKTOP_LAYOUT_MEDIA_QUERY)
    mediaQuery.addEventListener('change', onStoreChange)
    return () => {
        mediaQuery.removeEventListener('change', onStoreChange)
    }
}

function getDesktopLayoutSnapshot(): boolean {
    if (typeof window === 'undefined') {
        return false
    }

    return window.matchMedia(DESKTOP_LAYOUT_MEDIA_QUERY).matches
}

function getDesktopLayoutServerSnapshot(): boolean {
    return false
}

export function useDesktopSessionsLayout(): boolean {
    return useSyncExternalStore(subscribeDesktopLayoutChange, getDesktopLayoutSnapshot, getDesktopLayoutServerSnapshot)
}
