import { Suspense, lazy } from 'react'
import {
    Navigate,
    Outlet,
    createRootRoute,
    createRoute,
    createRouter,
} from '@tanstack/react-router'
import { App } from '@/App'
import { RouteLoadingFallback } from '@/components/loading/RouteLoadingFallback'
import { shouldRestoreWindowScroll } from '@/lib/appShellPresentation'
import {
    loadSessionsIndexRouteModule,
    loadSessionsShellRouteModule,
    loadSessionChatRouteModule,
    loadSessionFileRouteModule,
    loadSessionFilesRouteModule,
    loadNewSessionRouteModule,
    loadSessionTerminalRouteModule,
    loadSettingsRouteModule,
} from '@/routes/sessions/sessionRoutePreload'
import type { LoadingStateKind } from '@/components/loading/loadingStatePresentation'

const SessionsRoutePage = lazy(loadSessionsShellRouteModule)
const SessionsIndexRoutePage = lazy(loadSessionsIndexRouteModule)
const SessionChatRoutePage = lazy(loadSessionChatRouteModule)
const FilesPage = lazy(loadSessionFilesRouteModule)
const FilePage = lazy(loadSessionFileRouteModule)
const TerminalPage = lazy(loadSessionTerminalRouteModule)
const NewSessionRoutePage = lazy(loadNewSessionRouteModule)
const SettingsPage = lazy(loadSettingsRouteModule)

type SessionSearchTab = 'changes' | 'directories'
type SessionFileSearch = {
    path: string
    staged?: boolean
    tab?: SessionSearchTab
}

type RouteLoadingKind = LoadingStateKind

type RouteSuspenseProps = {
    kind: RouteLoadingKind
    children: React.JSX.Element
}

function parseSessionSearchTab(search: Record<string, unknown>): SessionSearchTab | undefined {
    const tabValue = typeof search.tab === 'string' ? search.tab : undefined
    if (tabValue === 'changes' || tabValue === 'directories') {
        return tabValue
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
        <Suspense fallback={<RouteLoadingFallback kind={props.kind} />}>
            {props.children}
        </Suspense>
    )
}

function FilesRoutePage(): React.JSX.Element {
    return (
        <RouteSuspense kind="files">
            <FilesPage />
        </RouteSuspense>
    )
}

function FileRoutePage(): React.JSX.Element {
    return (
        <RouteSuspense kind="files">
            <FilePage />
        </RouteSuspense>
    )
}

function TerminalRoutePage(): React.JSX.Element {
    return (
        <RouteSuspense kind="terminal">
            <TerminalPage />
        </RouteSuspense>
    )
}

function SettingsRoutePage(): React.JSX.Element {
    return (
        <RouteSuspense kind="workspace">
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
        <RouteSuspense kind="workspace">
            <NewSessionRoutePage />
        </RouteSuspense>
    )
}

function SessionsRoutePageShell(): React.JSX.Element {
    return (
        <RouteSuspense kind="workspace">
            <SessionsRoutePage />
        </RouteSuspense>
    )
}

function SessionsIndexRoutePageShell(): React.JSX.Element {
    return (
        <RouteSuspense kind="workspace">
            <SessionsIndexRoutePage />
        </RouteSuspense>
    )
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
    component: NewSessionRoutePageShell,
})

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: SettingsRoutePage,
})

export const routeTree = rootRoute.addChildren([
    indexRoute,
    sessionsRoute.addChildren([
        sessionsIndexRoute,
        newSessionRoute,
        sessionDetailRoute.addChildren([
            sessionChatRoute,
            sessionTerminalRoute,
            sessionFilesRoute,
            sessionFileRoute,
        ]),
    ]),
    settingsRoute,
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
