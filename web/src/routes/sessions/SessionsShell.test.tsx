import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionsShell } from './SessionsShell'

const navigateMock = vi.fn()
const useLocationMock = vi.fn()
const useMatchRouteMock = vi.fn()
const useSessionsMock = vi.fn()
const preloadSessionDetailRouteMock = vi.fn()
const preloadSessionDetailIntentMock = vi.fn()
const disposeSessionViewRuntimeMock = vi.fn()
const loadNewSessionRouteModuleMock = vi.fn(async () => undefined)
const loadSettingsRouteModuleMock = vi.fn(async () => undefined)
const queryClientMock = { prefetchQuery: vi.fn() }
const runPreloadedNavigationMock = vi.fn()

function createDeferred() {
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
    SessionList: (props: { actions: { onSelect: (sessionId: string) => void; onPreloadSession?: (sessionId: string) => void } }) => (
        <div data-testid="session-list">
            <button type="button" onClick={() => props.actions.onPreloadSession?.('session-1')}>
                preload-session
            </button>
            <button type="button" onClick={() => props.actions.onSelect('session-1')}>
                open-session
            </button>
        </div>
    )
}))

vi.mock('@/components/SessionsEmptyState', () => ({
    SessionsEmptyState: () => <div data-testid="sessions-empty-state" />
}))

vi.mock('@/components/icons', () => ({
    PlusIcon: () => <span data-testid="plus-icon" />,
    SettingsIcon: () => <span data-testid="settings-icon" />,
    BrandIcon: () => <span data-testid="brand-icon" />
}))

vi.mock('@/routes/sessions/sessionRoutePreload', () => ({
    preloadSessionDetailRoute: (...args: unknown[]) => preloadSessionDetailRouteMock(...args),
    preloadSessionDetailIntent: (...args: unknown[]) => preloadSessionDetailIntentMock(...args),
    loadNewSessionRouteModule: () => loadNewSessionRouteModuleMock(),
    loadSettingsRouteModule: () => loadSettingsRouteModuleMock()
}))

vi.mock('@/hooks/queries/sessionViewRuntime', () => ({
    disposeSessionViewRuntime: (...args: unknown[]) => disposeSessionViewRuntimeMock(...args)
}))

vi.mock('@/hooks/queries/useSessions', () => ({
    useSessions: (...args: unknown[]) => useSessionsMock(...args)
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: null
    })
}))

vi.mock('@/lib/networkPreloadPolicy', () => ({
    SESSIONS_IDLE_PRELOAD_DELAY_MS: 50,
    getNetworkInformation: () => null,
    shouldPreloadIdleSessionRoutes: () => false
}))

vi.mock('@/lib/navigationTransition', () => ({
    VIEW_TRANSITION_NAVIGATION_OPTIONS: {
        enableViewTransition: true
    },
    createNavigationTransitionOptions: (recoveryHref?: string) => (
        recoveryHref
            ? {
                enableViewTransition: true,
                recoveryHref
            }
            : {
                enableViewTransition: true
            }
    ),
    runNavigationTransition: (commit: () => void) => {
        commit()
    },
    runNavigationTransitionAfterPreload: async (
        preload: (() => Promise<unknown>) | Promise<unknown>,
        commit: () => void,
        options?: unknown
    ) => {
        try {
            await (typeof preload === 'function' ? preload() : preload)
        } catch {
        }
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
        t: (key: string, values?: Record<string, number>) => {
            if (key === 'sessions.summary' && values) {
                return `${values.open}/${values.archived}`
            }
            return key
        }
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
        navigateMock.mockReset()
        preloadSessionDetailRouteMock.mockReset()
        preloadSessionDetailIntentMock.mockReset()
        disposeSessionViewRuntimeMock.mockReset()
        loadNewSessionRouteModuleMock.mockClear()
        loadSettingsRouteModuleMock.mockClear()
        queryClientMock.prefetchQuery.mockReset()
        runPreloadedNavigationMock.mockReset()
        useLocationMock.mockReturnValue('/sessions/session-1')
        useMatchRouteMock.mockReturnValue({ sessionId: 'session-1' })
        useSessionsMock.mockReturnValue({
            sessions: [],
            error: null
        })
    })

    it('keeps a stable overflow-hidden detail viewport for the routed surface', () => {
        render(<SessionsShell preloaders={[]} />)

        const detailViewport = screen.getByTestId('sessions-detail-viewport')
        expect(detailViewport).toHaveClass('overflow-hidden')
        expect(screen.getByTestId('outlet')).toBeInTheDocument()
    })

    it('preloads session detail data and modules on selection intent', () => {
        render(<SessionsShell preloaders={[]} />)

        fireEvent.click(screen.getByText('preload-session'))

        expect(preloadSessionDetailIntentMock).toHaveBeenCalledWith({
            api: null,
            queryClient: queryClientMock,
            sessionId: 'session-1',
            recoveryHref: '/sessions/session-1'
        })
    })

    it('waits for session preload to settle before navigating into a session', async () => {
        const deferred = createDeferred()
        preloadSessionDetailRouteMock.mockReturnValueOnce(deferred.promise)

        render(<SessionsShell preloaders={[]} />)

        fireEvent.click(screen.getByText('open-session'))

        expect(preloadSessionDetailRouteMock).toHaveBeenCalledWith({
            api: null,
            queryClient: queryClientMock,
            sessionId: 'session-1',
            includeWorkspace: true,
            includeLatestMessages: true
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

    it('disposes the previous session runtime when leaving the session route', () => {
        const { rerender } = render(<SessionsShell preloaders={[]} />)

        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)

        rerender(<SessionsShell preloaders={[]} />)

        expect(disposeSessionViewRuntimeMock).toHaveBeenCalledWith(
            queryClientMock,
            'session-1'
        )
    })

    it('waits for the settings route preload before navigating there', async () => {
        const deferred = createDeferred()
        loadSettingsRouteModuleMock.mockReturnValueOnce(deferred.promise)

        render(<SessionsShell preloaders={[]} />)

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

        render(<SessionsShell preloaders={[]} />)

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
        preloadSessionDetailRouteMock.mockRejectedValueOnce(new Error('preload failed'))

        render(<SessionsShell preloaders={[]} />)

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

        render(<SessionsShell preloaders={[]} />)

        fireEvent.click(screen.getByTitle('settings.title'))

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({ to: '/settings' })
        })
    })

    it('still navigates when new-session preload fails', async () => {
        loadNewSessionRouteModuleMock.mockRejectedValueOnce(new Error('new preload failed'))

        render(<SessionsShell preloaders={[]} />)

        fireEvent.click(screen.getByTitle('sessions.new'))

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions/new' })
        })
    })

    it('preloads the settings route module before navigating there', async () => {
        render(<SessionsShell preloaders={[]} />)

        fireEvent.click(screen.getByTitle('settings.title'))

        await waitFor(() => {
            expect(loadSettingsRouteModuleMock).toHaveBeenCalledTimes(1)
            expect(navigateMock).toHaveBeenCalledWith({ to: '/settings' })
        })
    })

    it('preloads the new-session route module before navigating there', async () => {
        render(<SessionsShell preloaders={[]} />)

        fireEvent.click(screen.getByTitle('sessions.new'))

        await waitFor(() => {
            expect(loadNewSessionRouteModuleMock).toHaveBeenCalledTimes(1)
            expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions/new' })
        })
    })
})
