import { createContext, useContext } from 'react'
import type { SessionsShellStaticRouteId } from '@/routes/sessions/useSessionsShellPreloadOwner'

type SessionsShellNavigationContextValue = {
    onOpenStaticRoute: (routeId: SessionsShellStaticRouteId) => void
    pendingStaticRouteId: SessionsShellStaticRouteId | null
}

// Boundary: only static route navigation pending belongs here. Session/detail/runtime state stays in its owners.
const SessionsShellNavigationContext = createContext<SessionsShellNavigationContextValue | null>(null)

export const SessionsShellNavigationProvider = SessionsShellNavigationContext.Provider

export function useSessionsShellNavigation(): SessionsShellNavigationContextValue {
    const value = useContext(SessionsShellNavigationContext)
    if (!value) {
        throw new Error('useSessionsShellNavigation must be used inside SessionsShellNavigationProvider')
    }
    return value
}
