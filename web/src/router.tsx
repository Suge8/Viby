import { Suspense, lazy } from 'react'
import {
    Navigate,
    Outlet,
    createRootRoute,
    createRoute,
    createRouter,
    useLocation,
    useParams,
} from '@tanstack/react-router'
import { App } from '@/App'
import { RouteLoadingFallback } from '@/components/loading/RouteLoadingFallback'
import {
    loadSessionsShellRouteModule,
    loadSessionFileRouteModule,
    loadSessionFilesRouteModule,
    loadNewSessionRouteModule,
    loadSessionChatRouteModule,
    loadSessionTerminalRouteModule,
    loadSettingsRouteModule,
    SESSIONS_IDLE_PRELOADERS
} from '@/routes/sessions/sessionRoutePreload'
import type { LoadingStateKind } from '@/components/loading/loadingStatePresentation'

const FilesPage = lazy(loadSessionFilesRouteModule)
const FilePage = lazy(loadSessionFileRouteModule)
const TerminalPage = lazy(loadSessionTerminalRouteModule)
const SessionChatRoutePage = lazy(loadSessionChatRouteModule)
const SessionsShellRoutePage = lazy(async () => {
    const module = await loadSessionsShellRouteModule()
    return { default: module.SessionsShell }
})
const SessionsIndexRoutePage = lazy(async () => {
    const module = await loadSessionsShellRouteModule()
    return { default: module.SessionsIndexPage }
})
const NewSessionRoutePage = lazy(loadNewSessionRouteModule)
const SettingsPage = lazy(loadSettingsRouteModule)

type SessionSearchTab = 'changes' | 'directories'
type SessionFileSearch = {
    path: string
    staged?: boolean
    tab?: SessionSearchTab
}

type RouteLoadingKind = Exclude<LoadingStateKind, 'authorizing'>

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

function SessionDetailRoute(): React.JSX.Element {
    const pathname = useLocation({ select: location => location.pathname })
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const basePath = `/sessions/${sessionId}`
    const isChat = pathname === basePath || pathname === `${basePath}/`

    return isChat ? (
        <RouteSuspense kind="session">
            <SessionChatRoutePage />
        </RouteSuspense>
    ) : <Outlet />
}

function NewSessionRoutePageShell(): React.JSX.Element {
    return (
        <RouteSuspense kind="workspace">
            <NewSessionRoutePage />
        </RouteSuspense>
    )
}

function SessionsRoutePage(): React.JSX.Element {
    return (
        <RouteSuspense kind="workspace">
            <SessionsShellRoutePage preloaders={SESSIONS_IDLE_PRELOADERS} />
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
    component: SessionsRoutePage,
})

const sessionsIndexRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '/',
    component: SessionsIndexRoutePageShell,
})

const sessionDetailRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '$sessionId',
    component: SessionDetailRoute,
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
        scrollRestoration: true,
    })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
    interface Register {
        router: AppRouter
    }
}
