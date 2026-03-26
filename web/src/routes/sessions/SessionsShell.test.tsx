import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeLastOpenedSessionId } from '@/lib/sessionEntryPreference'
import { SessionsShell } from './SessionsShell'

const navigateMock = vi.fn()
const useLocationMock = vi.fn()
const useMatchRouteMock = vi.fn()
const useSessionsMock = vi.fn()
const preloadSessionDetailCriticalRouteMock = vi.fn()
const preloadSessionDetailRouteMock = vi.fn()
const preloadSessionDetailIntentMock = vi.fn()
const warmSessionDetailRouteDataMock = vi.fn()
const disposeSessionViewRuntimeMock = vi.fn()
const loadNewSessionRouteModuleMock = vi.fn(async () => undefined)
const loadSettingsRouteModuleMock = vi.fn(async () => undefined)
const getNetworkInformationMock = vi.fn(() => null)
const shouldPreloadIdleSessionRoutesMock = vi.fn<(connection?: unknown) => boolean>(() => false)
const queryClientMock = { prefetchQuery: vi.fn() }
const runPreloadedNavigationMock = vi.fn()
const useFinalizeBootShellMock = vi.fn()

function createDeferred(): {
    promise: Promise<undefined>
    resolve: () => void
} {
    let resolve!: (value: undefined) => void
    const promise = new Promise<undefined>((done) => {
        resolve = done
    })
    return {
        promise,
        resolve: () => resolve(undefined)
    }
}

vi.mock('@tanstack/react-router', () => ({
    Outlet: () => <div data-testid="outlet" />,
    useLocation: (options?: { select?: (location: { pathname: string }) => string }) => {
        const location = { pathname: useLocationMock() }
        return options?.select ? options.select(location) : location
    },
    useMatchRoute: () => useMatchRouteMock,
    useNavigate: () => navigateMock
}))

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => queryClientMock
}))

vi.mock('@/components/SessionList', () => ({
    SessionList: (props: {
        actions: {
            onSelect: (sessionId: string) => void
            onPreloadSession?: (sessionId: string) => void
            onNewSession: () => void
            onArchiveSelectedSession?: (sessionId: string) => void
        }
    }) => (
        <div data-testid="session-list">
            <button type="button" onClick={() => props.actions.onPreloadSession?.('session-1')}>
                preload-session
            </button>
            <button type="button" onClick={() => props.actions.onSelect('session-1')}>
                open-session
            </button>
            <button type="button" onClick={() => props.actions.onArchiveSelectedSession?.('session-1')}>
                archive-selected-session
            </button>
            <button type="button" title="sessions.new" onClick={() => props.actions.onNewSession()}>
                new-session
            </button>
        </div>
    )
}))

vi.mock('@/components/SessionsEmptyState', () => ({
    SessionsEmptyState: () => <div data-testid="sessions-empty-state" />
}))

vi.mock('@/routes/sessions/sessionRoutePreload', () => ({
    SESSIONS_IDLE_PRELOADERS: [
        () => loadNewSessionRouteModuleMock(),
        () => loadSettingsRouteModuleMock()
    ],
    loadNewSessionRouteModule: () => loadNewSessionRouteModuleMock(),
    loadSettingsRouteModule: () => loadSettingsRouteModuleMock()
}))

vi.mock('@/routes/sessions/sessionDetailRoutePreload', () => ({
    preloadSessionDetailCriticalRoute: (...args: unknown[]) => preloadSessionDetailCriticalRouteMock(...args),
    preloadSessionDetailRoute: (...args: unknown[]) => preloadSessionDetailRouteMock(...args),
    preloadSessionDetailIntent: (...args: unknown[]) => preloadSessionDetailIntentMock(...args),
    warmSessionDetailRouteData: (...args: unknown[]) => warmSessionDetailRouteDataMock(...args),
}))

vi.mock('@/hooks/queries/sessionViewRuntime', () => ({
    disposeSessionViewRuntime: (...args: unknown[]) => disposeSessionViewRuntimeMock(...args)
}))

vi.mock('@/hooks/queries/useSessions', () => ({
    useSessions: (...args: unknown[]) => useSessionsMock(...args)
}))

vi.mock('@/hooks/useFinalizeBootShell', () => ({
    useFinalizeBootShell: (when?: boolean) => useFinalizeBootShellMock(when)
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: null
    })
}))

vi.mock('@/lib/networkPreloadPolicy', () => ({
    SESSIONS_IDLE_PRELOAD_DELAY_MS: 50,
    getNetworkInformation: () => getNetworkInformationMock(),
    shouldPreloadIdleSessionRoutes: (connection?: unknown) => shouldPreloadIdleSessionRoutesMock(connection)
}))

vi.mock('@/lib/navigationTransition', () => ({
    runPreloadedNavigation: async (
        preload: (() => Promise<unknown>) | Promise<unknown>,
        commit: () => void,
        recoveryHref: string
    ) => {
        runPreloadedNavigationMock(preload, commit, recoveryHref)
        try {
            await (typeof preload === 'function' ? preload() : preload)
        } catch {
        }
        commit()
    },
}))

vi.mock('@/lib/noticePresets', () => ({
    getNoticePreset: () => ({
        title: 'Something went wrong'
    })
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key
    })
}))

vi.mock('@/routes/sessions/components/SessionRouteBanner', () => ({
    SessionRouteBanner: () => <div data-testid="session-route-banner" />
}))

describe('SessionsShell', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        window.localStorage.clear()
        navigateMock.mockReset()
        preloadSessionDetailCriticalRouteMock.mockReset()
        preloadSessionDetailRouteMock.mockReset()
        preloadSessionDetailIntentMock.mockReset()
        warmSessionDetailRouteDataMock.mockReset()
        disposeSessionViewRuntimeMock.mockReset()
        loadNewSessionRouteModuleMock.mockClear()
        loadSettingsRouteModuleMock.mockClear()
        getNetworkInformationMock.mockReset()
        shouldPreloadIdleSessionRoutesMock.mockReset()
        queryClientMock.prefetchQuery.mockReset()
        runPreloadedNavigationMock.mockReset()
        useFinalizeBootShellMock.mockReset()
        getNetworkInformationMock.mockReturnValue(null)
        shouldPreloadIdleSessionRoutesMock.mockReturnValue(false)
        useLocationMock.mockReturnValue('/sessions/session-1')
        useMatchRouteMock.mockReturnValue({ sessionId: 'session-1' })
        useSessionsMock.mockReturnValue({
            sessions: [],
            error: null
        })
        preloadSessionDetailCriticalRouteMock.mockResolvedValue(undefined)
        preloadSessionDetailRouteMock.mockResolvedValue(undefined)
    })

    it('keeps a stable overflow-hidden detail viewport for the routed surface', () => {
        render(<SessionsShell />)

        expect(screen.getByTestId('sessions-list-pane')).toHaveAttribute('data-sessions-pane', 'list')
        expect(screen.getByTestId('sessions-list-pane')).toHaveClass('sessions-mobile-list-pane')
        expect(screen.getByTestId('sessions-detail-pane')).toHaveAttribute('data-sessions-pane', 'detail')
        expect(screen.getByTestId('sessions-detail-pane')).toHaveClass('sessions-mobile-detail-pane')
        const detailViewport = screen.getByTestId('sessions-detail-viewport')
        expect(detailViewport).toHaveClass('overflow-hidden')
        expect(screen.getByTestId('outlet')).toBeInTheDocument()
        expect(useFinalizeBootShellMock).toHaveBeenCalledWith(false)
    })

    it('releases the boot shell when the sessions index is the active route', () => {
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)

        render(<SessionsShell />)

        expect(useFinalizeBootShellMock).toHaveBeenCalledWith(true)
    })

    it('preloads session detail data and modules on selection intent', () => {
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('preload-session'))

        expect(preloadSessionDetailIntentMock).toHaveBeenCalledWith({
            api: null,
            queryClient: queryClientMock,
            sessionId: 'session-1',
            recoveryHref: '/sessions/session-1'
        })
    })

    it('does not re-preload the currently selected session on list intent', () => {
        render(<SessionsShell />)

        fireEvent.click(screen.getByText('preload-session'))

        expect(preloadSessionDetailIntentMock).not.toHaveBeenCalled()
    })

    it('returns to /sessions when the currently selected session is archived', () => {
        render(<SessionsShell />)

        fireEvent.click(screen.getByText('archive-selected-session'))

        expect(navigateMock).toHaveBeenCalledWith({
            to: '/sessions',
            replace: true
        })
    })

    it('does not navigate away when an archived session is not the current route selection', () => {
        useLocationMock.mockReturnValue('/sessions/session-2')
        useMatchRouteMock.mockReturnValue({ sessionId: 'session-2' })

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('archive-selected-session'))

        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('warms the most likely next session during idle time on fast networks', async () => {
        shouldPreloadIdleSessionRoutesMock.mockReturnValue(true)
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        writeLastOpenedSessionId('session-1')
        useSessionsMock.mockReturnValue({
            sessions: [
                {
                    id: 'session-2',
                    active: true,
                    thinking: false,
                    activeAt: 2_000,
                    updatedAt: 2_000,
                    latestActivityAt: 2_000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: 2_000,
                    lifecycleState: 'running',
                    lifecycleStateSince: 2_000,
                    metadata: null,
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    resumeAvailable: true,
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'high'
                },
                {
                    id: 'session-1',
                    active: true,
                    thinking: false,
                    activeAt: 1_000,
                    updatedAt: 1_000,
                    latestActivityAt: 1_000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: 1_000,
                    lifecycleState: 'running',
                    lifecycleStateSince: 1_000,
                    metadata: null,
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    resumeAvailable: true,
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'medium'
                }
            ],
            error: null
        })

        Object.defineProperty(window, 'requestIdleCallback', {
            configurable: true,
            value: vi.fn((callback: IdleRequestCallback) => {
                callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline)
                return 1
            })
        })
        Object.defineProperty(window, 'cancelIdleCallback', {
            configurable: true,
            value: vi.fn()
        })

        render(<SessionsShell />)

        await waitFor(() => {
            expect(preloadSessionDetailRouteMock).toHaveBeenCalledWith({
                api: null,
                queryClient: queryClientMock,
                sessionId: 'session-1',
                includeLatestMessages: false
            })
        })
    })

    it('does not idle-warm another session while a session detail route is already selected', () => {
        shouldPreloadIdleSessionRoutesMock.mockReturnValue(true)
        useSessionsMock.mockReturnValue({
            sessions: [
                {
                    id: 'session-2',
                    active: true,
                    thinking: false,
                    activeAt: 2_000,
                    updatedAt: 2_000,
                    latestActivityAt: 2_000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: 2_000,
                    lifecycleState: 'running',
                    lifecycleStateSince: 2_000,
                    metadata: null,
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    resumeAvailable: true,
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'high'
                }
            ],
            error: null
        })

        render(<SessionsShell />)

        expect(preloadSessionDetailRouteMock).not.toHaveBeenCalled()
    })

    it('waits only for the critical route preload before navigating into a session', async () => {
        const deferred = createDeferred()
        preloadSessionDetailCriticalRouteMock.mockReturnValueOnce(deferred.promise)
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('open-session'))

        expect(preloadSessionDetailCriticalRouteMock).toHaveBeenCalledWith({
            api: null,
            queryClient: queryClientMock,
            sessionId: 'session-1'
        })
        expect(warmSessionDetailRouteDataMock).toHaveBeenCalledWith({
            api: null,
            queryClient: queryClientMock,
            sessionId: 'session-1',
            includeLatestMessages: true,
            recoveryHref: '/sessions/session-1'
        })
        expect(navigateMock).not.toHaveBeenCalled()

        deferred.resolve()

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({
                to: '/sessions/$sessionId',
                params: { sessionId: 'session-1' }
            })
        })
        expect(runPreloadedNavigationMock).toHaveBeenLastCalledWith(
            expect.any(Function),
            expect.any(Function),
            '/sessions/session-1'
        )
    })

    it('does not re-run navigation work when the current session is selected again', () => {
        render(<SessionsShell />)

        fireEvent.click(screen.getByText('open-session'))

        expect(preloadSessionDetailCriticalRouteMock).not.toHaveBeenCalled()
        expect(warmSessionDetailRouteDataMock).not.toHaveBeenCalled()
        expect(runPreloadedNavigationMock).not.toHaveBeenCalled()
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('disposes the previous session runtime when leaving the session route', () => {
        const { rerender } = render(<SessionsShell />)

        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)

        rerender(<SessionsShell />)

        expect(disposeSessionViewRuntimeMock).toHaveBeenCalledWith(
            queryClientMock,
            'session-1'
        )
    })

    it('waits for the settings route preload before navigating there', async () => {
        const deferred = createDeferred()
        loadSettingsRouteModuleMock.mockReturnValueOnce(deferred.promise)

        render(<SessionsShell />)

        fireEvent.click(screen.getByTitle('settings.title'))

        expect(loadSettingsRouteModuleMock).toHaveBeenCalledTimes(1)
        expect(navigateMock).not.toHaveBeenCalled()

        deferred.resolve()

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({ to: '/settings' })
        })
        expect(runPreloadedNavigationMock).toHaveBeenLastCalledWith(
            expect.any(Promise),
            expect.any(Function),
            '/settings'
        )
    })

    it('waits for the new-session route preload before navigating there', async () => {
        const deferred = createDeferred()
        loadNewSessionRouteModuleMock.mockReturnValueOnce(deferred.promise)

        render(<SessionsShell />)

        fireEvent.click(screen.getByTitle('sessions.new'))

        expect(loadNewSessionRouteModuleMock).toHaveBeenCalledTimes(1)
        expect(navigateMock).not.toHaveBeenCalled()

        deferred.resolve()

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions/new' })
        })
        expect(runPreloadedNavigationMock).toHaveBeenLastCalledWith(
            expect.any(Promise),
            expect.any(Function),
            '/sessions/new'
        )
    })

    it('still navigates when session preload fails', async () => {
        preloadSessionDetailCriticalRouteMock.mockRejectedValueOnce(new Error('preload failed'))
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('open-session'))

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({
                to: '/sessions/$sessionId',
                params: { sessionId: 'session-1' }
            })
        })
    })

    it('still navigates when settings preload fails', async () => {
        loadSettingsRouteModuleMock.mockRejectedValueOnce(new Error('settings preload failed'))

        render(<SessionsShell />)

        fireEvent.click(screen.getByTitle('settings.title'))

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({ to: '/settings' })
        })
    })

    it('still navigates when new-session preload fails', async () => {
        loadNewSessionRouteModuleMock.mockRejectedValueOnce(new Error('new preload failed'))

        render(<SessionsShell />)

        fireEvent.click(screen.getByTitle('sessions.new'))

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions/new' })
        })
    })

    it('preloads the settings route module before navigating there', async () => {
        render(<SessionsShell />)

        fireEvent.click(screen.getByTitle('settings.title'))

        await waitFor(() => {
            expect(loadSettingsRouteModuleMock).toHaveBeenCalledTimes(1)
            expect(navigateMock).toHaveBeenCalledWith({ to: '/settings' })
        })
    })

    it('preloads the new-session route module before navigating there', async () => {
        render(<SessionsShell />)

        fireEvent.click(screen.getByTitle('sessions.new'))

        await waitFor(() => {
            expect(loadNewSessionRouteModuleMock).toHaveBeenCalledTimes(1)
            expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions/new' })
        })
    })
})
