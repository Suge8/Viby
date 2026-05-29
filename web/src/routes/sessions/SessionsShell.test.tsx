import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_LIST_CREATE_BUTTON_TEST_ID } from '@/lib/sessionUiContracts'
import { createTestSessionListSummary } from '@/test/sessionFactories'
import { SessionsShell } from './SessionsShell'

type TestHistoryAction = { type: 'PUSH' | 'REPLACE' | 'FORWARD' | 'BACK' } | { type: 'GO'; index: number }
type TestHistoryEvent = { action: TestHistoryAction; location: { href: string; pathname: string } }

const navigateMock = vi.fn()
const routerHistorySubscribeMock = vi.fn<(callback: (event: TestHistoryEvent) => void) => () => void>(
    () => () => undefined
)
const useLocationMock = vi.fn()
const useMatchRouteMock = vi.fn()
const useSearchMock = vi.fn()
const useSessionsMock = vi.fn()
const remoteInteractionBlockedMock = vi.fn(() => false)
const preloadSessionDetailCriticalRouteMock = vi.fn()
const preloadSessionDetailRouteMock = vi.fn()
const preloadSessionDetailIntentMock = vi.fn()
const warmSessionDetailAncillaryRouteDataMock = vi.fn()
const disposeSessionViewRuntimeMock = vi.fn()
const loadAgentConfigRouteModuleMock = vi.fn(async () => undefined)
const loadNewSessionRouteModuleMock = vi.fn(async () => undefined)
const loadSettingsRouteModuleMock = vi.fn(async () => undefined)
const getNetworkInformationMock = vi.fn(() => null)
const shouldPreloadIdleSessionRoutesMock = vi.fn<(connection?: unknown) => boolean>(() => false)
const queryClientMock = { prefetchQuery: vi.fn() }
const runPreloadedNavigationMock = vi.fn()
const runNavigationTransitionMock = vi.fn()
const useFinalizeBootShellMock = vi.fn()
const addToastMock = vi.fn()

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
    useLocation: (options?: { select?: (location: { href: string; pathname: string }) => string }) => {
        const pathname = useLocationMock()
        const location = { href: pathname, pathname }
        return options?.select ? options.select(location) : location
    },
    useMatchRoute: () => useMatchRouteMock,
    useNavigate: () => navigateMock,
    useRouter: () => ({
        history: {
            subscribe: routerHistorySubscribeMock,
        },
    }),
    useSearch: () => useSearchMock(),
}))

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => queryClientMock,
}))

vi.mock('@/components/SessionList', () => ({
    SessionList: (props: {
        activeSectionId?: 'running' | 'history' | null
        openingSessionId?: string | null
        actions: {
            onSelect: (sessionId: string) => void
            onSessionIntent?: (sessionId: string, source: 'focus' | 'hover' | 'press') => void
        }
        onActiveSectionChange?: (sectionId: 'running' | 'history') => void
    }) => (
        <div
            data-testid="session-list"
            data-active-section-id={props.activeSectionId ?? ''}
            data-opening-session-id={props.openingSessionId ?? ''}
        >
            <button type="button" onClick={() => props.actions.onSessionIntent?.('session-1', 'hover')}>
                preload-session
            </button>
            <button type="button" onClick={() => props.actions.onSelect('session-1')}>
                open-session
            </button>
            <button type="button" onClick={() => props.onActiveSectionChange?.('history')}>
                show-history
            </button>
            <button type="button" onClick={() => props.onActiveSectionChange?.('running')}>
                show-running
            </button>
        </div>
    ),
}))

vi.mock('@/components/SessionsEmptyState', () => ({
    SessionsEmptyState: () => <div data-testid="sessions-empty-state" />,
}))

vi.mock('@/routes/sessions/sessionRoutePreload', () => ({
    SESSIONS_IDLE_PRELOADERS: [() => loadNewSessionRouteModuleMock(), () => loadSettingsRouteModuleMock()],
    loadAgentConfigRouteModule: () => loadAgentConfigRouteModuleMock(),
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
        return true
    },
}))

vi.mock('@/lib/notice-center', () => ({
    useNoticeCenter: () => ({ addToast: addToastMock }),
}))

vi.mock('@/lib/noticePresets', () => ({
    getNoticePreset: () => ({
        title: 'Something went wrong',
        tone: 'danger',
    }),
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

vi.mock('@/remote/remotePairingInteractionState', () => ({
    useRemotePairingInteractionBlocked: () => remoteInteractionBlockedMock(),
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
        routerHistorySubscribeMock.mockClear()
        preloadSessionDetailCriticalRouteMock.mockReset()
        preloadSessionDetailRouteMock.mockReset()
        preloadSessionDetailIntentMock.mockReset()
        warmSessionDetailAncillaryRouteDataMock.mockReset()
        disposeSessionViewRuntimeMock.mockReset()
        loadAgentConfigRouteModuleMock.mockClear()
        loadNewSessionRouteModuleMock.mockClear()
        loadSettingsRouteModuleMock.mockClear()
        getNetworkInformationMock.mockReset()
        shouldPreloadIdleSessionRoutesMock.mockReset()
        queryClientMock.prefetchQuery.mockReset()
        runPreloadedNavigationMock.mockReset()
        runNavigationTransitionMock.mockReset()
        useFinalizeBootShellMock.mockReset()
        addToastMock.mockReset()
        remoteInteractionBlockedMock.mockReset()
        remoteInteractionBlockedMock.mockReturnValue(false)
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

        expect(screen.getByTestId('session-list')).toHaveAttribute('data-opening-session-id', 'session-1')
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
                search: {},
            })
        })
    })

    it('keeps the selected card pending until the route selection catches up', async () => {
        const deferred = createDeferred()
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        useSearchMock.mockReturnValue({ section: undefined })
        preloadSessionDetailCriticalRouteMock.mockReturnValueOnce(deferred.promise)

        const { rerender } = render(<SessionsShell />)

        fireEvent.click(screen.getByText('open-session'))
        expect(screen.getByTestId('session-list')).toHaveAttribute('data-opening-session-id', 'session-1')

        deferred.resolve()
        await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1))
        expect(screen.getByTestId('session-list')).toHaveAttribute('data-opening-session-id', 'session-1')

        useLocationMock.mockReturnValue('/sessions/session-1')
        useMatchRouteMock.mockReturnValue({ sessionId: 'session-1' })
        rerender(<SessionsShell />)

        await waitFor(() => {
            expect(screen.getByTestId('session-list')).toHaveAttribute('data-opening-session-id', '')
        })
    })

    it('releases pending navigation when route path changes before selection catch-up', async () => {
        const deferred = createDeferred()
        let historySubscriber: ((event: TestHistoryEvent) => void) | null = null
        routerHistorySubscribeMock.mockImplementation((callback) => {
            historySubscriber = callback
            return () => undefined
        })
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        useSearchMock.mockReturnValue({ section: undefined })
        preloadSessionDetailCriticalRouteMock.mockReturnValueOnce(deferred.promise)

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('open-session'))
        expect(screen.getByTestId('session-list')).toHaveAttribute('data-opening-session-id', 'session-1')

        await act(async () => {
            historySubscriber?.({
                action: { type: 'PUSH' },
                location: { href: '/sessions/session-1', pathname: '/sessions/session-1' },
            })
        })

        await waitFor(() => {
            expect(screen.getByTestId('session-list')).toHaveAttribute('data-opening-session-id', '')
        })
    })

    it('dedupes repeated opens through the pending navigation owner', () => {
        const deferred = createDeferred()
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        useSearchMock.mockReturnValue({ section: undefined })
        preloadSessionDetailCriticalRouteMock.mockReturnValue(deferred.promise)

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('open-session'))
        fireEvent.click(screen.getByText('open-session'))

        expect(runPreloadedNavigationMock).toHaveBeenCalledTimes(1)
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

    it('suppresses stale session query toasts while remote reconnect owns the workspace', () => {
        remoteInteractionBlockedMock.mockReturnValue(true)
        useSessionsMock.mockReturnValue({
            sessions: [],
            error: 'session transport failed',
        })

        render(<SessionsShell />)

        expect(addToastMock).not.toHaveBeenCalled()
    })

    it('shows session query errors outside remote reconnect', () => {
        useSessionsMock.mockReturnValue({
            sessions: [],
            error: 'session load failed',
        })

        render(<SessionsShell />)

        expect(addToastMock).toHaveBeenCalledWith({
            tone: 'danger',
            title: 'Something went wrong',
            description: 'session load failed',
        })
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
                search: {},
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

    it('syncs an initial history route before clearing the selected detail', async () => {
        useLocationMock.mockReturnValue('/sessions/session-2')
        useMatchRouteMock.mockReturnValue({ sessionId: 'session-2' })
        useSessionsMock.mockReturnValue({
            sessions: [createTestSessionListSummary({ id: 'session-2' })],
            error: null,
        })

        render(<SessionsShell />)

        await waitFor(() => {
            expect(screen.getByTestId('session-list')).toHaveAttribute('data-active-section-id', 'history')
        })
        expect(navigateMock).not.toHaveBeenCalled()
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

    it('keeps section tab switches local on the sessions index', () => {
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        useSearchMock.mockReturnValue({ section: 'history' })

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('show-running'))

        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('opens a session after a section switch without waiting for a tab URL replace', async () => {
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        useSearchMock.mockReturnValue({ section: undefined })

        render(<SessionsShell />)

        fireEvent.click(screen.getByText('show-history'))
        expect(navigateMock).not.toHaveBeenCalled()

        fireEvent.click(screen.getByText('open-session'))

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({
                to: '/sessions/$sessionId',
                params: { sessionId: 'session-1' },
                search: {},
            })
        })
    })

    it('waits for the settings route preload before navigating there', async () => {
        const deferred = createDeferred()
        loadSettingsRouteModuleMock.mockReturnValueOnce(deferred.promise)

        render(<SessionsShell />)

        const settingsButton = screen.getByTitle('settings.title')
        fireEvent.click(settingsButton)

        expect(settingsButton).toHaveAttribute('aria-busy', 'true')
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

    it('waits for the agents route preload before navigating there', async () => {
        const deferred = createDeferred()
        loadAgentConfigRouteModuleMock.mockReturnValueOnce(deferred.promise)

        render(<SessionsShell />)

        const agentsButton = screen.getByTitle('agents.config.title')
        fireEvent.click(agentsButton)

        expect(agentsButton).toHaveAttribute('aria-busy', 'true')
        expect(loadAgentConfigRouteModuleMock).toHaveBeenCalledTimes(1)
        expect(navigateMock).not.toHaveBeenCalled()

        deferred.resolve()

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions/agents' })
        })
        expect(runPreloadedNavigationMock).toHaveBeenLastCalledWith(
            expect.any(Promise),
            expect.any(Function),
            '/sessions/agents'
        )
    })

    it('waits for the new-session route preload before navigating there', async () => {
        const deferred = createDeferred()
        loadNewSessionRouteModuleMock.mockReturnValueOnce(deferred.promise)
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)

        render(<SessionsShell />)

        const createButton = screen.getByTitle('sessions.new')
        fireEvent.click(createButton)

        expect(createButton).toHaveAttribute('aria-busy', 'true')
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
                search: {},
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
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)

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
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)

        render(<SessionsShell />)

        fireEvent.click(screen.getByTitle('sessions.new'))

        await waitFor(() => {
            expect(loadNewSessionRouteModuleMock).toHaveBeenCalledTimes(1)
            expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions/new' })
        })
    })
})
