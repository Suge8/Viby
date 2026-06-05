import type { JSX, MutableRefObject, ReactNode } from 'react'
import type { ApiClient } from '@/api/client'
import { MotionRouteOutlet } from '@/components/motion/motionPrimitives'
import type { AuthSource } from '@/hooks/useAuth'
import { AppContextProvider, type AppContextValue } from '@/lib/app-context'
import type { AppViewportRoute } from '@/lib/appShellPresentation'

export type ReadyAppSession = {
    baseUrl: string
    renderAppProvider: (children: ReactNode) => JSX.Element
    readRuntimeContext?: () => AppContextValue
}

export type ReadyAppRuntimeSession = AppContextValue

type AppViewportShellProps = {
    appViewportRoute: AppViewportRoute
}

export function AppViewportShell(props: AppViewportShellProps): JSX.Element {
    return (
        <div className="app-shell flex h-full flex-col" data-viby-route={props.appViewportRoute}>
            <div className="app-route-layer min-h-0 flex-1">
                <div className="app-route-transition h-full min-h-0 w-full">
                    <MotionRouteOutlet scope="app" className="h-full min-h-0 w-full" />
                </div>
            </div>
        </div>
    )
}

type AppReadyShellProps = {
    appViewportRoute: AppViewportRoute
    children: ReactNode
    session: ReadyAppSession
}

export function AppReadyShell(props: AppReadyShellProps): JSX.Element {
    return props.session.renderAppProvider(
        <>
            <AppViewportShell appViewportRoute={props.appViewportRoute} />
            {props.children}
        </>
    )
}

export function createReadyAppSession(
    token: string | null,
    api: ApiClient | null,
    baseUrl: string
): ReadyAppSession | null {
    if (!token || !api) {
        return null
    }

    const readRuntimeContext = () => ({ api, baseUrl, token })
    return {
        baseUrl,
        readRuntimeContext,
        renderAppProvider: (children) => (
            <AppContextProvider value={readRuntimeContext()}>{children}</AppContextProvider>
        ),
    }
}

export function getReadyAppRuntimeSession(session: ReadyAppSession): ReadyAppRuntimeSession {
    if (!session.readRuntimeContext) {
        throw new Error('App runtime context is not available')
    }
    return session.readRuntimeContext()
}

export function canRetainReadyShell(options: {
    authError: string | null
    authSource: AuthSource | null
    baseUrl: string
    retainedReadySession: ReadyAppSession | null
}): boolean {
    const { authError, authSource, baseUrl, retainedReadySession } = options
    if (!retainedReadySession || retainedReadySession.baseUrl !== baseUrl) {
        return false
    }

    return Boolean(authSource) && !authError
}

export function resolveDisplayAppSession(options: {
    authError: string | null
    authSource: AuthSource | null
    baseUrl: string
    readyAppSession: ReadyAppSession | null
    retainedReadySessionRef: MutableRefObject<ReadyAppSession | null>
}): ReadyAppSession | null {
    if (options.readyAppSession) {
        options.retainedReadySessionRef.current = options.readyAppSession
        return options.readyAppSession
    }

    const retainedReadySession = options.retainedReadySessionRef.current
    if (
        canRetainReadyShell({
            authError: options.authError,
            authSource: options.authSource,
            baseUrl: options.baseUrl,
            retainedReadySession,
        })
    ) {
        return retainedReadySession
    }

    options.retainedReadySessionRef.current = null
    return null
}
