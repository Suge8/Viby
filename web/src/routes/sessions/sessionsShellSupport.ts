import type { QueryClient } from '@tanstack/react-query'
import type { useNavigate } from '@tanstack/react-router'
import type { ApiClient } from '@/api/client'
import { runPreloadedNavigation } from '@/lib/navigationTransition'
import {
    getNetworkInformation,
    SESSIONS_IDLE_PRELOAD_DELAY_MS,
    shouldPreloadIdleSessionRoutes,
} from '@/lib/networkPreloadPolicy'
import {
    AGENTS_ROUTE,
    NEW_SESSION_ROUTE,
    SESSIONS_INDEX_ROUTE,
    SETTINGS_ROUTE,
} from '@/routes/sessions/sessionRoutePaths'
import type { PreloadSessionDetailRouteOptions } from './sessionDetailRoutePreload'

type IdleTask = () => void

type PaneMotion = {
    opacity: number
    scale: number
    x: string
}

type SessionsPaneTransition = {
    duration: number
    ease?: readonly [number, number, number, number]
}

export type SessionsPaneMotionState = {
    listPaneAnimate: PaneMotion
    detailPaneAnimate: PaneMotion
    listPanePointerEvents: 'auto' | 'none'
    detailPanePointerEvents: 'auto' | 'none'
    paneTransition: SessionsPaneTransition
}

type StaticSessionsRoute = typeof NEW_SESSION_ROUTE | typeof SETTINGS_ROUTE | typeof AGENTS_ROUTE
export type SessionIntentSource = 'focus' | 'hover' | 'press'
export type SessionIntentRecord = {
    at: number
    sessionId: string
    source: SessionIntentSource
}

const ACTIVE_PANE_MOTION: PaneMotion = { opacity: 1, scale: 1, x: '0%' }
const HIDDEN_DETAIL_PANE_MOTION: PaneMotion = { opacity: 0, scale: 0.986, x: '12%' }
const SESSIONS_PANE_TRANSITION: SessionsPaneTransition = {
    duration: 0.42,
    ease: [0.22, 1, 0.36, 1],
}
const INSTANT_PANE_TRANSITION: SessionsPaneTransition = { duration: 0 }
const SESSION_INTENT_DEDUPE_WINDOW_MS = 220
const SESSION_INTENT_PRIORITY: Record<SessionIntentSource, number> = {
    hover: 1,
    focus: 2,
    press: 3,
}

type SessionsIndexNavigation = {
    to: typeof SESSIONS_INDEX_ROUTE
    replace: true
    search?: {
        section?: 'history'
    }
}

type SessionsHistoryAction = Readonly<
    | { type: 'PUSH' | 'REPLACE' | 'FORWARD' | 'BACK' }
    | {
          type: 'GO'
          index: number
      }
>

export function isSelectedSession(selectedSessionId: string | null, sessionId: string): boolean {
    return selectedSessionId === sessionId
}

export function shouldRunIdleSessionPreload(): boolean {
    return shouldPreloadIdleSessionRoutes(getNetworkInformation())
}

export function isSessionsBackNavigationAction(action: SessionsHistoryAction): boolean {
    return action.type === 'BACK' || (action.type === 'GO' && action.index < 0)
}

export function shouldDispatchSessionIntent(options: {
    lastIntent: SessionIntentRecord | null
    selectedSessionId: string | null
    sessionId: string
    source: SessionIntentSource
    now?: number
}): boolean {
    if (isSelectedSession(options.selectedSessionId, options.sessionId)) {
        return false
    }

    const now = options.now ?? Date.now()
    const lastIntent = options.lastIntent
    if (!lastIntent || lastIntent.sessionId !== options.sessionId) {
        return true
    }

    if (now - lastIntent.at > SESSION_INTENT_DEDUPE_WINDOW_MS) {
        return true
    }

    return SESSION_INTENT_PRIORITY[options.source] > SESSION_INTENT_PRIORITY[lastIntent.source]
}

export function createSessionIntentRecord(options: {
    sessionId: string
    source: SessionIntentSource
    now?: number
}): SessionIntentRecord {
    return {
        at: options.now ?? Date.now(),
        sessionId: options.sessionId,
        source: options.source,
    }
}

export function buildSessionDetailReadyPreloadOptions(options: {
    api: ApiClient | null
    queryClient: QueryClient
    sessionId: string
}): PreloadSessionDetailRouteOptions {
    return {
        api: options.api,
        queryClient: options.queryClient,
        sessionId: options.sessionId,
        includeWorkspaceRuntime: true,
    }
}

export function scheduleIdleTask(task: IdleTask): (() => void) | undefined {
    if (typeof window === 'undefined') {
        return undefined
    }

    if ('requestIdleCallback' in window) {
        const idleId = window.requestIdleCallback(task)
        return () => window.cancelIdleCallback(idleId)
    }

    const timeoutId = globalThis.setTimeout(task, SESSIONS_IDLE_PRELOAD_DELAY_MS)
    return () => globalThis.clearTimeout(timeoutId)
}

export function runStaticRouteNavigation(
    navigate: ReturnType<typeof useNavigate>,
    route: StaticSessionsRoute,
    preload: Promise<unknown>
): Promise<boolean> {
    return runPreloadedNavigation(
        preload,
        () => {
            void navigate({ to: route })
        },
        route
    )
}

export function getSessionsPaneMotionState(options: {
    isDesktopLayout: boolean
    isSessionsIndex: boolean
    skipPaneTransition?: boolean
}): SessionsPaneMotionState {
    const paneTransition = options.skipPaneTransition ? INSTANT_PANE_TRANSITION : SESSIONS_PANE_TRANSITION
    if (options.isDesktopLayout) {
        return {
            listPaneAnimate: ACTIVE_PANE_MOTION,
            detailPaneAnimate: ACTIVE_PANE_MOTION,
            listPanePointerEvents: 'auto',
            detailPanePointerEvents: 'auto',
            paneTransition,
        }
    }

    if (options.isSessionsIndex) {
        return {
            listPaneAnimate: ACTIVE_PANE_MOTION,
            detailPaneAnimate: HIDDEN_DETAIL_PANE_MOTION,
            listPanePointerEvents: 'auto',
            detailPanePointerEvents: 'none',
            paneTransition,
        }
    }

    return {
        listPaneAnimate: ACTIVE_PANE_MOTION,
        detailPaneAnimate: ACTIVE_PANE_MOTION,
        listPanePointerEvents: 'none',
        detailPanePointerEvents: 'auto',
        paneTransition,
    }
}

export function buildSessionsIndexNavigation(sectionId: 'running' | 'history'): SessionsIndexNavigation {
    if (sectionId === 'history') {
        return {
            to: SESSIONS_INDEX_ROUTE,
            replace: true,
            search: { section: 'history' },
        }
    }

    return {
        to: SESSIONS_INDEX_ROUTE,
        replace: true,
    }
}
