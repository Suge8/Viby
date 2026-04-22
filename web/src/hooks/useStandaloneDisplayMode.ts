import { useSyncExternalStore } from 'react'
import { subscribeForegroundPulse } from '@/lib/foregroundPulse'

const STANDALONE_DISPLAY_MODE_QUERY = '(display-mode: standalone)'

type LegacyNavigator = Navigator & {
    standalone?: boolean
}

function supportsStandaloneNavigatorFlag(navigatorValue: Navigator): navigatorValue is LegacyNavigator {
    return 'standalone' in navigatorValue
}

export function isStandaloneDisplayMode(): boolean {
    if (typeof window === 'undefined') {
        return false
    }

    if (window.matchMedia(STANDALONE_DISPLAY_MODE_QUERY).matches) {
        return true
    }

    if (!supportsStandaloneNavigatorFlag(window.navigator)) {
        return false
    }

    return window.navigator.standalone === true
}

function bindMediaQueryListener(mediaQuery: MediaQueryList, listener: () => void): () => void {
    if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', listener)
        return () => mediaQuery.removeEventListener('change', listener)
    }

    mediaQuery.addListener(listener)
    return () => mediaQuery.removeListener(listener)
}

function subscribeStandaloneDisplayMode(listener: () => void): () => void {
    if (typeof window === 'undefined') {
        return () => {}
    }

    const mediaQuery = window.matchMedia(STANDALONE_DISPLAY_MODE_QUERY)
    const unbindMediaQueryListener = bindMediaQueryListener(mediaQuery, listener)
    const unsubscribeForegroundPulse = subscribeForegroundPulse(listener)

    return () => {
        unbindMediaQueryListener()
        unsubscribeForegroundPulse()
    }
}

function getStandaloneDisplayModeServerSnapshot(): boolean {
    return false
}

export function useStandaloneDisplayMode(): boolean {
    return useSyncExternalStore(
        subscribeStandaloneDisplayMode,
        isStandaloneDisplayMode,
        getStandaloneDisplayModeServerSnapshot
    )
}
