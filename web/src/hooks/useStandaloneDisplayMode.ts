import { useEffect, useState } from 'react'

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

function bindMediaQueryListener(
    mediaQuery: MediaQueryList,
    listener: () => void
): () => void {
    if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', listener)
        return () => mediaQuery.removeEventListener('change', listener)
    }

    mediaQuery.addListener(listener)
    return () => mediaQuery.removeListener(listener)
}

export function useStandaloneDisplayMode(): boolean {
    const [isStandalone, setIsStandalone] = useState<boolean>(() => isStandaloneDisplayMode())

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        const mediaQuery = window.matchMedia(STANDALONE_DISPLAY_MODE_QUERY)
        function syncStandaloneDisplayMode(): void {
            setIsStandalone(isStandaloneDisplayMode())
        }

        syncStandaloneDisplayMode()
        const unbindMediaQueryListener = bindMediaQueryListener(mediaQuery, syncStandaloneDisplayMode)
        window.addEventListener('pageshow', syncStandaloneDisplayMode)

        return () => {
            unbindMediaQueryListener()
            window.removeEventListener('pageshow', syncStandaloneDisplayMode)
        }
    }, [])

    return isStandalone
}
