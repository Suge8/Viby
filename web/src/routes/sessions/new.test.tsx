import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NewSessionRoute from './new'

const navigateMock = vi.fn()
const useSearchMock = vi.fn()
const invalidateQueriesMock = vi.fn()
const preloadSessionDetailCriticalRouteMock = vi.fn()
const warmSessionDetailAncillaryRouteDataMock = vi.fn()
const runPreloadedNavigationMock = vi.fn()
const useRuntimeMock = vi.fn()
const useFinalizeBootShellMock = vi.fn()
const goBackMock = vi.fn()
const refetchRuntimeMock = vi.fn(async () => undefined)
const queryClientMock = {
    invalidateQueries: (...args: unknown[]) => invalidateQueriesMock(...args),
}

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

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => queryClientMock,
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => navigateMock,
    useSearch: () => useSearchMock(),
}))

vi.mock('@/components/icons', () => ({
    BrandMarkIcon: () => <div data-testid="brand-mark-icon" />,
}))

vi.mock('@/components/NewSession', () => ({
    NewSession: (props: { onSuccess: (sessionId: string) => void }) => (
        <button type="button" onClick={() => props.onSuccess('session-1')}>
            launch-session
        </button>
    ),
}))

vi.mock('@/components/SurfaceRouteHeader', () => ({
    SurfaceRouteHeader: () => <div data-testid="surface-route-header" />,
}))

vi.mock('@/components/InlineNotice', () => ({
    InlineNotice: (props: { description?: string }) => <div data-testid="inline-notice">{props.description}</div>,
}))

vi.mock('@/components/LoadingState', () => ({
    LoadingState: (props: { label?: string; description?: string }) => (
        <div data-testid="loading-state">
            {props.label}
            {props.description}
        </div>
    ),
}))

vi.mock('@/components/StageBrandMark', () => ({
    StageBrandMark: () => <div data-testid="stage-brand-mark" />,
    STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME: 'tone',
}))

vi.mock('@/hooks/queries/useRuntime', () => ({
    useRuntime: (...args: unknown[]) => useRuntimeMock(...args),
}))

vi.mock('@/hooks/useAppGoBack', () => ({
    useAppGoBack: () => goBackMock,
}))

vi.mock('@/hooks/useFinalizeBootShell', () => ({
    useFinalizeBootShell: (...args: unknown[]) => useFinalizeBootShellMock(...args),
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: null,
    }),
}))

vi.mock('@/lib/navigationTransition', () => ({
    VIEW_TRANSITION_NAVIGATION_OPTIONS: {
        enableViewTransition: true,
    },
    runNavigationTransition: (commit: () => void) => {
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

vi.mock('@/lib/query-keys', () => ({
    queryKeys: {
        sessions: ['sessions'],
    },
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

vi.mock('@/routes/sessions/components/SessionRoutePageSurface', () => ({
    SessionRoutePageSurface: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

vi.mock('@/routes/sessions/sessionDetailRoutePreload', () => ({
    preloadSessionDetailCriticalRoute: (...args: unknown[]) => preloadSessionDetailCriticalRouteMock(...args),
    warmSessionDetailAncillaryRouteData: (...args: unknown[]) => warmSessionDetailAncillaryRouteDataMock(...args),
}))

vi.mock('@/routes/sessions/sessionRoutePaths', () => ({
    buildSessionHref: (sessionId: string) => `/sessions/${sessionId}`,
    NEW_SESSION_ROUTE: '/sessions/new',
    SESSIONS_INDEX_ROUTE: '/sessions',
}))

describe('NewSessionRoute', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        navigateMock.mockReset()
        useSearchMock.mockReset()
        invalidateQueriesMock.mockReset()
        preloadSessionDetailCriticalRouteMock.mockReset()
        warmSessionDetailAncillaryRouteDataMock.mockReset()
        runPreloadedNavigationMock.mockReset()
        useRuntimeMock.mockReset()
        useFinalizeBootShellMock.mockReset()
        goBackMock.mockReset()
        refetchRuntimeMock.mockReset()

        useSearchMock.mockReturnValue({})
        useRuntimeMock.mockReturnValue({
            runtime: { id: 'runtime-1', active: true, metadata: null },
            isLoading: false,
            error: null,
            refetch: refetchRuntimeMock,
        })
        preloadSessionDetailCriticalRouteMock.mockResolvedValue(undefined)
    })

    it('warms session detail data without blocking route commit on the full preload after launch success', async () => {
        const deferred = createDeferred()
        preloadSessionDetailCriticalRouteMock.mockReturnValue(deferred.promise)

        render(<NewSessionRoute />)

        fireEvent.click(screen.getByText('launch-session'))

        expect(invalidateQueriesMock).toHaveBeenCalledWith({
            queryKey: ['sessions'],
        })
        expect(warmSessionDetailAncillaryRouteDataMock).toHaveBeenCalledWith({
            api: null,
            includeWorkspaceRuntime: true,
            queryClient: queryClientMock,
            sessionId: 'session-1',
        })
        expect(preloadSessionDetailCriticalRouteMock).toHaveBeenCalledWith({
            api: null,
            includeWorkspaceRuntime: true,
            queryClient: queryClientMock,
            sessionId: 'session-1',
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
                replace: true,
            })
        })
    })

    it('blocks the form when the local runtime is unavailable', () => {
        useRuntimeMock.mockReturnValue({
            runtime: { id: 'runtime-1', active: false, metadata: null, runnerState: { lastSpawnError: null } },
            isLoading: false,
            error: null,
            refetch: refetchRuntimeMock,
        })

        render(<NewSessionRoute />)

        expect(screen.queryByText('launch-session')).not.toBeInTheDocument()
        expect(screen.getByText('runtime.unavailable.title')).toBeInTheDocument()
        expect(screen.getByText('runtime.unavailable.message')).toBeInTheDocument()
        expect(screen.getByText('runtime.unavailable.hint')).toBeInTheDocument()
    })

    it('keeps the form visible while an active runtime is refreshing in the background', () => {
        useRuntimeMock.mockReturnValue({
            runtime: { id: 'runtime-1', active: true, metadata: null },
            isLoading: false,
            isFetching: true,
            error: null,
            refetch: refetchRuntimeMock,
        })

        render(<NewSessionRoute />)

        expect(screen.getByText('launch-session')).toBeInTheDocument()
        expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
    })

    it('uses the shared runtime query defaults on mount so cached runtime stays visible', () => {
        render(<NewSessionRoute />)

        expect(useRuntimeMock).toHaveBeenCalledWith(null, true)
    })

    it('requests one background runtime refresh after mount when a runtime snapshot is already present', async () => {
        render(<NewSessionRoute />)

        await waitFor(() => {
            expect(refetchRuntimeMock).toHaveBeenCalledTimes(1)
        })
    })

    it('does not trigger background refresh while the runtime query is still cold-loading', () => {
        useRuntimeMock.mockReturnValue({
            runtime: null,
            isLoading: true,
            error: null,
            refetch: refetchRuntimeMock,
        })

        render(<NewSessionRoute />)

        expect(refetchRuntimeMock).not.toHaveBeenCalled()
    })
})
