import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_LIST_CREATE_BUTTON_TEST_ID } from '@/lib/sessionUiContracts'
import { SessionsShell } from './SessionsShell'

const navigateMock = vi.fn()
const useLocationMock = vi.fn()
const useMatchRouteMock = vi.fn()
const useSearchMock = vi.fn()
const useSessionsMock = vi.fn()
const preloadSessionDetailCriticalRouteMock = vi.fn()
const preloadSessionDetailRouteMock = vi.fn()
const preloadSessionDetailIntentMock = vi.fn()
const warmSessionDetailAncillaryRouteDataMock = vi.fn()
const disposeSessionViewRuntimeMock = vi.fn()
const loadNewSessionRouteModuleMock = vi.fn(async () => undefined)
const loadSettingsRouteModuleMock = vi.fn(async () => undefined)
const getNetworkInformationMock = vi.fn(() => null)
const shouldPreloadIdleSessionRoutesMock = vi.fn<(connection?: unknown) => boolean>(() => false)
const queryClientMock = { prefetchQuery: vi.fn() }
const runPreloadedNavigationMock = vi.fn()
const runNavigationTransitionMock = vi.fn()
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
        resolve: () => resolve(undefined),
    }
}

vi.mock('@tanstack/react-router', () => ({
    Outlet: () => <div data-testid="outlet" />,
    useLocation: (options?: { select?: (location: { pathname: string }) => string }) => {
        const location = { pathname: useLocationMock() }
        return options?.select ? options.select(location) : location
    },
    useMatchRoute: () => useMatchRouteMock,
    useNavigate: () => navigateMock,
    useSearch: () => useSearchMock(),
}))

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => queryClientMock,
}))

vi.mock('@/components/SessionList', () => ({
    SessionList: (props: {
        actions: {
            onSelect: (sessionId: string) => void
            onSessionIntent?: (sessionId: string, source: 'focus' | 'hover' | 'press') => void
            onNewSession: () => void
        }
        onActiveSectionChange?: (sectionId: 'running' | 'history') => void
    }) => (
        <div data-testid="session-list">
            <button type="button" onClick={() => props.actions.onSessionIntent?.('session-1', 'hover')}>
                preload-session
            </button>
            <button type="button" onClick={() => props.actions.onSelect('session-1')}>
                open-session
            </button>
            <button type="button" onClick={() => props.onActiveSectionChange?.('history')}>
                show-history
            </button>
            <button type="button" title="sessions.new" onClick={() => props.actions.onNewSession()}>
                new-session
            </button>
        </div>
    ),
}))

vi.mock('@/components/SessionsEmptyState', () => ({
    SessionsEmptyState: () => <div data-testid="sessions-empty-state" />,
}))

vi.mock('@/routes/sessions/sessionRoutePreload', () => ({
    SESSIONS_IDLE_PRELOADERS: [() => loadNewSessionRouteModuleMock(), () => loadSettingsRouteModuleMock()],
    loadNewSessionRouteModule: () => loadNewSessionRouteModuleMock(),
    loadSettingsRouteModule: () => loadSettingsRouteModuleMock(),
}))

vi.mock('@/routes/sessions/sessionDetailRoutePreload', () => ({
    preloadSessionDetailCriticalRoute: (...args: unknown[]) => preloadSessionDetailCriticalRouteMock(...args),
    preloadSessionDetailRoute: (...args: unknown[]) => preloadSessionDetailRouteMock(...args),
    preloadSessionDetailIntent: (...args: unknown[]) => preloadSessionDetailIntentMock(...args),
    warmSessionDetailAncillaryRouteData: (...args: unknown[]) => warmSessionDetailAncillaryRouteDataMock(...args),
}))

vi.mock('@/hooks/queries/sessionViewRuntime', () => ({
    disposeSessionViewRuntime: (...args: unknown[]) => disposeSessionViewRuntimeMock(...args),
}))

vi.mock('@/hooks/queries/useSessions', () => ({
    useSessions: (...args: unknown[]) => useSessionsMock(...args),
}))

vi.mock('@/hooks/useFinalizeBootShell', () => ({
    useFinalizeBootShell: (when?: boolean) => useFinalizeBootShellMock(when),
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: null,
    }),
}))

vi.mock('@/lib/networkPreloadPolicy', () => ({
    SESSIONS_IDLE_PRELOAD_DELAY_MS: 50,
    getNetworkInformation: () => getNetworkInformationMock(),
    shouldPreloadIdleSessionRoutes: (connection?: unknown) => shouldPreloadIdleSessionRoutesMock(connection),
}))

vi.mock('@/lib/navigationTransition', () => ({
    createNavigationTransitionOptions: (recoveryHref?: string) => ({
        enableViewTransition: true,
        recoveryHref,
    }),
    runNavigationTransition: (commit: () => void, options?: { recoveryHref?: string }) => {
        runNavigationTransitionMock(commit, options)
        commit()
    },
    runPreloadedNavigation: async (
        preload: (() => Promise<unknown>) | Promise<unknown>,
        commit: () => void,
        recoveryHref: string
    ) => {
        runPreloadedNavigationMock(preload, commit, recoveryHref)
        try {
            await (typeof preload === 'function' ? preload() : preload)
        } catch {}
        commit()
    },
}))

vi.mock('@/lib/noticePresets', () => ({
    getNoticePreset: () => ({
        title: 'Something went wrong',
    }),
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

vi.mock('@/routes/sessions/components/SessionRouteBanner', () => ({
    SessionRouteBanner: () => <div data-testid="session-route-banner" />,
}))

describe('SessionsShell', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn().mockImplementation(() => ({
                matches: false,
                media: '(min-width: 1024px)',
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        })
        window.localStorage.clear()
        navigateMock.mockReset()
        preloadSessionDetailCriticalRouteMock.mockReset()
        preloadSessionDetailRouteMock.mockReset()
        preloadSessionDetailIntentMock.mockReset()
        warmSessionDetailAncillaryRouteDataMock.mockReset()
        disposeSessionViewRuntimeMock.mockReset()
        loadNewSessionRouteModuleMock.mockClear()
        loadSettingsRouteModuleMock.mockClear()
        getNetworkInformationMock.mockReset()
        shouldPreloadIdleSessionRoutesMock.mockReset()
        queryClientMock.prefetchQuery.mockReset()
        runPreloadedNavigationMock.mockReset()
        runNavigationTransitionMock.mockReset()
        useFinalizeBootShellMock.mockReset()
        getNetworkInformationMock.mockReturnValue(null)
        shouldPreloadIdleSessionRoutesMock.mockReturnValue(false)
        useLocationMock.mockReturnValue('/sessions/session-1')
        useMatchRouteMock.mockReturnValue({ sessionId: 'session-1' })
        useSearchMock.mockReturnValue({ section: undefined })
        useSessionsMock.mockReturnValue({
            sessions: [],
            error: null,
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
        useSearchMock.mockReturnValue({ section: undefined })

        render(<SessionsShell />)

        expect(useFinalizeBootShellMock).toHaveBeenCalledWith(true)
    })

    it('renders a single semantic new-session button on the mobile sessions index', () => {
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        useSearchMock.mockReturnValue({ section: undefined })

        render(<SessionsShell />)

        expect(screen.getAllByTestId(SESSION_LIST_CREATE_BUTTON_TEST_ID)).toHaveLength(1)
    })

    it('preloads session detail data and modules on selection intent', () => {
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        useSearchMock.mockReturnValue({ section: undefined })

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('preload-session'))

        expect(preloadSessionDetailIntentMock).toHaveBeenCalledWith({
            api: null,
            queryClient: queryClientMock,
            sessionId: 'session-1',
            recoveryHref: '/sessions/session-1',
        })
    })

    it('waits for the critical session preload before committing navigation', async () => {
        const deferred = createDeferred()
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        useSearchMock.mockReturnValue({ section: undefined })
        preloadSessionDetailCriticalRouteMock.mockReturnValue(deferred.promise)

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('open-session'))

        expect(preloadSessionDetailCriticalRouteMock).toHaveBeenCalledWith({
            api: null,
            queryClient: queryClientMock,
            sessionId: 'session-1',
            includeWorkspaceRuntime: true,
        })
        expect(warmSessionDetailAncillaryRouteDataMock).toHaveBeenCalledWith({
            api: null,
            queryClient: queryClientMock,
            sessionId: 'session-1',
            includeWorkspaceRuntime: true,
        })
        expect(runPreloadedNavigationMock).toHaveBeenCalledWith(
            expect.any(Function),
            expect.any(Function),
            '/sessions/session-1'
        )
        expect(navigateMock).not.toHaveBeenCalled()

        deferred.resolve()

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({
                to: '/sessions/$sessionId',
                params: { sessionId: 'session-1' },
            })
        })
    })

    it('does not re-preload the currently selected session on list intent', () => {
        render(<SessionsShell />)

        fireEvent.click(screen.getByText('preload-session'))

        expect(preloadSessionDetailIntentMock).not.toHaveBeenCalled()
    })

    it('warms lightweight static routes during idle time on fast networks', async () => {
        shouldPreloadIdleSessionRoutesMock.mockReturnValue(true)
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        useSearchMock.mockReturnValue({ section: undefined })

        Object.defineProperty(window, 'requestIdleCallback', {
            configurable: true,
            value: vi.fn((callback: IdleRequestCallback) => {
                callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline)
                return 1
            }),
        })
        Object.defineProperty(window, 'cancelIdleCallback', {
            configurable: true,
            value: vi.fn(),
        })

        render(<SessionsShell />)

        await waitFor(() => {
            expect(loadNewSessionRouteModuleMock).toHaveBeenCalledTimes(1)
            expect(loadSettingsRouteModuleMock).toHaveBeenCalledTimes(1)
        })
    })

    it('does not run idle route warmup on constrained networks', () => {
        render(<SessionsShell />)

        expect(loadNewSessionRouteModuleMock).not.toHaveBeenCalled()
        expect(loadSettingsRouteModuleMock).not.toHaveBeenCalled()
    })

    it('keeps explicit session navigation on the preloaded path', async () => {
        const deferred = createDeferred()
        preloadSessionDetailCriticalRouteMock.mockReturnValueOnce(deferred.promise)
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        useSearchMock.mockReturnValue({ section: undefined })

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('open-session'))

        expect(preloadSessionDetailCriticalRouteMock).toHaveBeenCalledWith({
            api: null,
            queryClient: queryClientMock,
            sessionId: 'session-1',
            includeWorkspaceRuntime: true,
        })
        expect(warmSessionDetailAncillaryRouteDataMock).toHaveBeenCalledWith({
            api: null,
            queryClient: queryClientMock,
            sessionId: 'session-1',
            includeWorkspaceRuntime: true,
        })
        expect(runPreloadedNavigationMock).toHaveBeenCalledWith(
            expect.any(Function),
            expect.any(Function),
            '/sessions/session-1'
        )
        expect(navigateMock).not.toHaveBeenCalled()

        deferred.resolve()

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({
                to: '/sessions/$sessionId',
                params: { sessionId: 'session-1' },
            })
        })
    })

    it('does not re-run navigation work when the current session is selected again', () => {
        render(<SessionsShell />)

        fireEvent.click(screen.getByText('open-session'))

        expect(preloadSessionDetailCriticalRouteMock).not.toHaveBeenCalled()
        expect(preloadSessionDetailRouteMock).not.toHaveBeenCalled()
        expect(warmSessionDetailAncillaryRouteDataMock).not.toHaveBeenCalled()
        expect(runPreloadedNavigationMock).not.toHaveBeenCalled()
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('disposes the previous session runtime when leaving the session route', () => {
        const { rerender } = render(<SessionsShell />)

        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        useSearchMock.mockReturnValue({ section: undefined })

        rerender(<SessionsShell />)

        expect(disposeSessionViewRuntimeMock).toHaveBeenCalledWith(queryClientMock, 'session-1')
    })

    it('does not dispose the currently selected session during StrictMode remounts', () => {
        render(
            <StrictMode>
                <SessionsShell />
            </StrictMode>
        )

        expect(disposeSessionViewRuntimeMock).not.toHaveBeenCalled()
    })

    it('clears the selected detail when the current running session moves into history', async () => {
        const now = Date.now()
        useSessionsMock.mockReturnValue({
            sessions: [
                {
                    id: 'session-1',
                    active: true,
                    thinking: false,
                    activeAt: now,
                    updatedAt: now,
                    latestActivityAt: now,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now,
                    lifecycleState: 'running',
                    lifecycleStateSince: now,
                    metadata: null,
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    resumeAvailable: true,
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'medium',
                },
            ],
            error: null,
        })

        const { rerender } = render(<SessionsShell />)

        useSessionsMock.mockReturnValue({
            sessions: [
                {
                    id: 'session-1',
                    active: false,
                    thinking: false,
                    activeAt: now,
                    updatedAt: now + 1,
                    latestActivityAt: now + 1,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now + 1,
                    lifecycleState: 'closed',
                    lifecycleStateSince: now + 1,
                    metadata: null,
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    resumeAvailable: true,
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'medium',
                },
            ],
            error: null,
        })

        rerender(<SessionsShell />)

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions', replace: true })
        })
    })

    it('clears the selected detail when the selected session disappears from the authoritative list', async () => {
        const now = Date.now()
        useSessionsMock.mockReturnValue({
            sessions: [
                {
                    id: 'session-1',
                    active: true,
                    thinking: false,
                    activeAt: now,
                    updatedAt: now,
                    latestActivityAt: now,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now,
                    lifecycleState: 'running',
                    lifecycleStateSince: now,
                    metadata: null,
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    resumeAvailable: true,
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'medium',
                },
            ],
            error: null,
        })

        const { rerender } = render(<SessionsShell />)

        useSessionsMock.mockReturnValue({
            sessions: [],
            error: null,
        })

        rerender(<SessionsShell />)

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions', replace: true })
        })
    })

    it('clears the selected detail into the matching empty state when the user switches tabs away from it', async () => {
        const now = Date.now()
        useSessionsMock.mockReturnValue({
            sessions: [
                {
                    id: 'session-1',
                    active: true,
                    thinking: false,
                    activeAt: now,
                    updatedAt: now,
                    latestActivityAt: now,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now,
                    lifecycleState: 'running',
                    lifecycleStateSince: now,
                    metadata: null,
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    resumeAvailable: true,
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'medium',
                },
                {
                    id: 'session-2',
                    active: false,
                    thinking: false,
                    activeAt: now - 1,
                    updatedAt: now - 1,
                    latestActivityAt: now - 1,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now - 1,
                    lifecycleState: 'closed',
                    lifecycleStateSince: now - 1,
                    metadata: null,
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    resumeAvailable: false,
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'medium',
                },
            ],
            error: null,
        })

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('show-history'))

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({
                to: '/sessions',
                replace: true,
                search: { section: 'history' },
            })
        })
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
            expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions/settings' })
        })
        expect(runPreloadedNavigationMock).toHaveBeenLastCalledWith(
            expect.any(Promise),
            expect.any(Function),
            '/sessions/settings'
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
        useSearchMock.mockReturnValue({ section: undefined })

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('open-session'))

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({
                to: '/sessions/$sessionId',
                params: { sessionId: 'session-1' },
            })
        })

        expect(warmSessionDetailAncillaryRouteDataMock).toHaveBeenCalledWith({
            api: null,
            queryClient: queryClientMock,
            sessionId: 'session-1',
            includeWorkspaceRuntime: true,
        })
    })

    it('still navigates when settings preload fails', async () => {
        loadSettingsRouteModuleMock.mockRejectedValueOnce(new Error('settings preload failed'))

        render(<SessionsShell />)

        fireEvent.click(screen.getByTitle('settings.title'))

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions/settings' })
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
            expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions/settings' })
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
