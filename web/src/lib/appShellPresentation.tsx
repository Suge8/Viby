import { RouteLoadingFallback } from '@/components/loading/RouteLoadingFallback'
import type { RealtimeBannerState } from '@/hooks/useRealtimeFeedback'

export type RealtimeSubscription = { all: true; sessionId?: string }
export type AppViewportRoute = 'default' | 'session-chat'

export function isUnauthorizedAuthError(error: string | null): boolean {
    if (!error) {
        return false
    }

    return error.includes('401') || error.includes('Invalid access token')
}

export function getAppViewportRoute(pathname: string): AppViewportRoute {
    if (/^\/sessions\/[^/]+\/?$/.test(pathname) && pathname !== '/sessions/new') {
        return 'session-chat'
    }

    return 'default'
}

export function shouldSuppressInstallPrompt(options: {
    isReady: boolean
    isAuthLoading: boolean
    bannerKind: RealtimeBannerState['kind']
}): boolean {
    if (options.isAuthLoading || !options.isReady) {
        return true
    }

    return options.bannerKind !== 'hidden'
}

export function getSelectedSessionId(sessionMatch: false | Record<string, string>): string | null {
    if (!sessionMatch || sessionMatch.sessionId === 'new') {
        return null
    }

    return sessionMatch.sessionId
}

export function buildRealtimeSubscription(selectedSessionId: string | null): RealtimeSubscription {
    if (!selectedSessionId) {
        return { all: true }
    }

    return {
        all: true,
        sessionId: selectedSessionId
    }
}

export function renderAuthorizingState(_t: (key: string) => string): React.JSX.Element {
    return (
        <RouteLoadingFallback
            kind="authorizing"
            withDescription
            testId="app-authorizing-fallback"
        />
    )
}
