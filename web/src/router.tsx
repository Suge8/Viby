import { createRootRoute, createRoute, createRouter, Navigate, Outlet } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { App } from '@/App'
import type { LoadingStateKind } from '@/components/loading/loadingStatePresentation'
import { RouteLoadingFallback } from '@/components/loading/RouteLoadingFallback'
import { shouldRestoreWindowScroll } from '@/lib/appShellPresentation'
import { SessionsIndexPage, SessionsShell } from '@/routes/sessions/SessionsShell'
import {
    loadNewSessionRouteModule,
    loadSessionChatRouteModule,
    loadSessionFileRouteModule,
    loadSessionFilesRouteModule,
    loadSessionTerminalRouteModule,
    loadSettingsRouteModule,
} from '@/routes/sessions/sessionRoutePreload'

const SessionChatRoutePage = lazy(loadSessionChatRouteModule)
const FilesPage = lazy(loadSessionFilesRouteModule)
const FilePage = lazy(loadSessionFileRouteModule)
const TerminalPage = lazy(loadSessionTerminalRouteModule)
const NewSessionRoutePage = lazy(loadNewSessionRouteModule)
const SettingsPage = lazy(loadSettingsRouteModule)

type SessionSearchTab = 'changes' | 'directories'
type NewSessionMode = 'start' | 'recover-local'
type SessionsSection = 'running' | 'history'
type SessionFileSearch = {
    path: string
    staged?: boolean
    tab?: SessionSearchTab
}

type RouteLoadingKind = LoadingStateKind

type RouteSuspenseProps = {
    kind: RouteLoadingKind
    variant?: 'panel' | 'inline'
    children: React.JSX.Element
}

function parseSessionSearchTab(search: Record<string, unknown>): SessionSearchTab | undefined {
    const tabValue = typeof search.tab === 'string' ? search.tab : undefined
    if (tabValue === 'changes' || tabValue === 'directories') {
        return tabValue
    }
    return undefined
}

function parseNewSessionMode(search: Record<string, unknown>): NewSessionMode | undefined {
    return search.mode === 'recover-local' ? 'recover-local' : undefined
}

function parseSessionsSection(search: Record<string, unknown>): SessionsSection | undefined {
    const sectionValue = typeof search.section === 'string' ? search.section : undefined
    if (sectionValue === 'running' || sectionValue === 'history') {
        return sectionValue
    }
    return undefined
}

function parseOptionalSearchBoolean(value: unknown): boolean | undefined {
    if (value === true || value === 'true') {
        return true
    }
    if (value === false || value === 'false') {
        return false
    }
    return undefined
}

function RouteSuspense(props: RouteSuspenseProps): React.JSX.Element {
    return (
        <Suspense fallback={<RouteLoadingFallback kind={props.kind} variant={props.variant} />}>
            {props.children}
        </Suspense>
    )
}

function FilesRoutePage(): React.JSX.Element {
    return (
        <RouteSuspense kind="files" variant="inline">
            <FilesPage />
        </RouteSuspense>
    )
}

function FileRoutePage(): React.JSX.Element {
    return (
        <RouteSuspense kind="files" variant="inline">
            <FilePage />
        </RouteSuspense>
    )
}

function TerminalRoutePage(): React.JSX.Element {
    return (
        <RouteSuspense kind="terminal" variant="inline">
            <TerminalPage />
        </RouteSuspense>
    )
}

function SettingsRoutePage(): React.JSX.Element {
    return (
        <RouteSuspense kind="workspace" variant="inline">
            <SettingsPage />
        </RouteSuspense>
    )
}

function SessionDetailRouteLayout(): React.JSX.Element {
    return <Outlet />
}

function SessionChatRoutePageShell(): React.JSX.Element {
    return (
        <Suspense fallback={null}>
            <SessionChatRoutePage />
        </Suspense>
    )
}

function NewSessionRoutePageShell(): React.JSX.Element {
    return (
        <RouteSuspense kind="workspace" variant="inline">
            <NewSessionRoutePage />
        </RouteSuspense>
    )
}

function SessionsRoutePageShell(): React.JSX.Element {
    return <SessionsShell />
}

function SessionsIndexRoutePageShell(): React.JSX.Element {
    return <SessionsIndexPage />
}

const rootRoute = createRootRoute({
    component: App,
})

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <Navigate to="/sessions" replace />,
})

const sessionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions',
    validateSearch: (search: Record<string, unknown>): { section?: SessionsSection } => {
        const section = parseSessionsSection(search)
        return section ? { section } : {}
    },
    component: SessionsRoutePageShell,
})

const sessionsIndexRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '/',
    component: SessionsIndexRoutePageShell,
})

const sessionDetailRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '$sessionId',
    component: SessionDetailRouteLayout,
})

const sessionChatRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: '/',
    component: SessionChatRoutePageShell,
})

const sessionFilesRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'files',
    validateSearch: (search: Record<string, unknown>): { tab?: SessionSearchTab } => {
        const tab = parseSessionSearchTab(search)
        return tab ? { tab } : {}
    },
    component: FilesRoutePage,
})

const sessionTerminalRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'terminal',
    component: TerminalRoutePage,
})

const sessionFileRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'file',
    validateSearch: (search: Record<string, unknown>): SessionFileSearch => {
        const path = typeof search.path === 'string' ? search.path : ''
        const staged = parseOptionalSearchBoolean(search.staged)
        const tab = parseSessionSearchTab(search)

        const result: SessionFileSearch = { path }
        if (staged !== undefined) {
            result.staged = staged
        }
        if (tab !== undefined) {
            result.tab = tab
        }
        return result
    },
    component: FileRoutePage,
})

const newSessionRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: 'new',
    validateSearch: (search: Record<string, unknown>): { mode?: NewSessionMode } => {
        const mode = parseNewSessionMode(search)
        return mode ? { mode } : {}
    },
    component: NewSessionRoutePageShell,
})

const settingsRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: 'settings',
    component: SettingsRoutePage,
})

export const routeTree = rootRoute.addChildren([
    indexRoute,
    sessionsRoute.addChildren([
        sessionsIndexRoute,
        newSessionRoute,
        settingsRoute,
        sessionDetailRoute.addChildren([sessionChatRoute, sessionTerminalRoute, sessionFilesRoute, sessionFileRoute]),
    ]),
])

type RouterHistory = Parameters<typeof createRouter>[0]['history']

export function createAppRouter(history?: RouterHistory) {
    return createRouter({
        routeTree,
        history,
        scrollRestoration: ({ location }) => shouldRestoreWindowScroll(location.pathname),
    })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
    interface Register {
        router: AppRouter
    }
}
