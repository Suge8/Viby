import type { RealtimeBannerState } from '@/hooks/useRealtimeFeedback'
import { resolveDirectSessionIdFromPath, resolveSessionRouteParam } from '@/routes/sessions/sessionRoutePaths'

export type RealtimeSubscription = { all: true; sessionId?: string }
export type AppViewportRoute = 'default' | 'session-chat'

function isSessionChatPath(pathname: string): boolean {
    return resolveDirectSessionIdFromPath(pathname) !== null
}

export function isUnauthorizedAuthError(error: string | null): boolean {
    if (!error) {
        return false
    }

    return error.includes('401') || error.includes('Invalid access token')
}

export function getAppViewportRoute(pathname: string): AppViewportRoute {
    return isSessionChatPath(pathname) ? 'session-chat' : 'default'
}

export function shouldRestoreWindowScroll(pathname: string): boolean {
    // Chat routes own their transcript viewport scroll; restoring window scroll adds visible top flashes.
    return !isSessionChatPath(pathname)
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
    return sessionMatch ? resolveSessionRouteParam(sessionMatch.sessionId) : null
}

export function buildRealtimeSubscription(selectedSessionId: string | null): RealtimeSubscription {
    if (!selectedSessionId) {
        return { all: true }
    }

    return {
        all: true,
        sessionId: selectedSessionId,
    }
}
