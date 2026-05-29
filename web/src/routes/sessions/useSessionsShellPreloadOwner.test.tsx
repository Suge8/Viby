import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shouldClearPendingNavigation, useSessionsShellPreloadOwner } from './useSessionsShellPreloadOwner'

const routePreloadMocks = vi.hoisted(() => ({
    loadAgentConfigRouteModule: vi.fn(async () => undefined),
    loadNewSessionRouteModule: vi.fn(async () => undefined),
    loadSettingsRouteModule: vi.fn(async () => undefined),
}))

vi.mock('@/routes/sessions/sessionDetailRoutePreload', () => ({
    preloadSessionDetailCriticalRoute: vi.fn(async () => undefined),
    preloadSessionDetailIntent: vi.fn(),
    warmSessionDetailAncillaryRouteData: vi.fn(),
}))

vi.mock('@/routes/sessions/sessionRoutePreload', () => ({
    SESSIONS_IDLE_PRELOADERS: [],
    loadAgentConfigRouteModule: routePreloadMocks.loadAgentConfigRouteModule,
    loadNewSessionRouteModule: routePreloadMocks.loadNewSessionRouteModule,
    loadSettingsRouteModule: routePreloadMocks.loadSettingsRouteModule,
}))

vi.mock('@/lib/navigationTransition', () => ({
    runPreloadedNavigation: async (preload: (() => Promise<unknown>) | Promise<unknown>, commit: () => void) => {
        try {
            await (typeof preload === 'function' ? preload() : preload)
        } catch {}
        commit()
        return true
    },
}))

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

afterEach(() => {
    vi.clearAllMocks()
})

describe('shouldClearPendingNavigation', () => {
    it('clears only when route or selected-session facts invalidate pending navigation', () => {
        const stablePending = {
            pathname: '/sessions/session-a',
            pendingTarget: { type: 'session' as const, sessionId: 'session-b' },
            pendingRouteVisitRevision: 1,
            routeVisitRevision: 1,
            selectedSessionChanged: false,
            selectedSessionId: 'session-a',
        }

        expect(shouldClearPendingNavigation(stablePending)).toBe(false)
        expect(shouldClearPendingNavigation({ ...stablePending, selectedSessionId: 'session-b' })).toBe(true)
        expect(shouldClearPendingNavigation({ ...stablePending, pathname: '/sessions/session-b' })).toBe(true)
        expect(shouldClearPendingNavigation({ ...stablePending, selectedSessionChanged: true })).toBe(true)
        expect(shouldClearPendingNavigation({ ...stablePending, routeVisitRevision: 2 })).toBe(true)
        expect(shouldClearPendingNavigation({ ...stablePending, pendingTarget: null })).toBe(false)
    })

    it('clears static route navigation only on route or selection changes', () => {
        const stablePending = {
            pathname: '/sessions',
            pendingTarget: { type: 'static' as const, routeId: 'settings' as const },
            pendingRouteVisitRevision: 1,
            routeVisitRevision: 1,
            selectedSessionChanged: false,
            selectedSessionId: 'session-a',
        }

        expect(shouldClearPendingNavigation(stablePending)).toBe(false)
        expect(shouldClearPendingNavigation({ ...stablePending, selectedSessionId: 'settings' })).toBe(false)
        expect(shouldClearPendingNavigation({ ...stablePending, pathname: '/sessions/settings' })).toBe(true)
        expect(shouldClearPendingNavigation({ ...stablePending, selectedSessionChanged: true })).toBe(true)
        expect(shouldClearPendingNavigation({ ...stablePending, routeVisitRevision: 2 })).toBe(true)
    })
})

describe('useSessionsShellPreloadOwner', () => {
    type PreloadOwnerOptions = Parameters<typeof useSessionsShellPreloadOwner>[0]

    function renderOwner(initial: {
        pathname?: string
        routeVisitRevision?: number
        selectedSessionId: string | null
    }) {
        const navigateMock = vi.fn()
        const baseOptions: PreloadOwnerOptions = {
            api: null,
            navigate: navigateMock as unknown as PreloadOwnerOptions['navigate'],
            pathname: initial.pathname ?? '/sessions',
            queryClient: {} as PreloadOwnerOptions['queryClient'],
            routeVisitRevision: initial.routeVisitRevision ?? 0,
            selectedSessionId: initial.selectedSessionId,
        }
        return {
            navigateMock,
            ...renderHook((props: PreloadOwnerOptions) => useSessionsShellPreloadOwner(props), {
                initialProps: baseOptions,
            }),
        }
    }

    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('clears pending navigation when navigation reaches the target session', async () => {
        const { result, rerender, navigateMock } = renderOwner({ selectedSessionId: null })

        await act(async () => {
            result.current.handleSelectSession('session-a')
            await vi.runAllTimersAsync()
        })

        expect(result.current.openingSessionId).toBe('session-a')
        expect(navigateMock).toHaveBeenCalled()

        // simulate router selectedSessionId catching up to the target
        rerender({
            api: null,
            navigate: navigateMock as unknown as PreloadOwnerOptions['navigate'],
            pathname: '/sessions/session-a',
            queryClient: {} as PreloadOwnerOptions['queryClient'],
            routeVisitRevision: 0,
            selectedSessionId: 'session-a',
        })

        expect(result.current.openingSessionId).toBeNull()
    })

    it('clears pending navigation when the pending session is already selected', async () => {
        const { result, rerender, navigateMock } = renderOwner({ selectedSessionId: 'session-a' })

        await act(async () => {
            result.current.handleSelectSession('session-b')
            await vi.runAllTimersAsync()
        })

        expect(result.current.openingSessionId).toBe('session-b')

        rerender({
            api: null,
            navigate: navigateMock as unknown as PreloadOwnerOptions['navigate'],
            pathname: '/sessions/session-b',
            queryClient: {} as PreloadOwnerOptions['queryClient'],
            routeVisitRevision: 0,
            selectedSessionId: 'session-b',
        })

        expect(result.current.openingSessionId).toBeNull()
    })

    it('lets a second session selection replace pending navigation', () => {
        const { result } = renderOwner({ selectedSessionId: null })

        act(() => {
            result.current.handleSelectSession('session-a')
            result.current.handleSelectSession('session-b')
        })

        expect(result.current.openingSessionId).toBe('session-b')
    })

    it('clears pending navigation when route path changes even if selected session returns to the source value', async () => {
        const { result, rerender, navigateMock } = renderOwner({ selectedSessionId: null })

        await act(async () => {
            result.current.handleSelectSession('session-a')
            await vi.runAllTimersAsync()
        })

        expect(result.current.openingSessionId).toBe('session-a')

        rerender({
            api: null,
            navigate: navigateMock as unknown as PreloadOwnerOptions['navigate'],
            pathname: '/sessions/session-a',
            queryClient: {} as PreloadOwnerOptions['queryClient'],
            routeVisitRevision: 2,
            selectedSessionId: null,
        })

        expect(result.current.openingSessionId).toBeNull()
    })

    it('clears session pending navigation when the route path reaches the target', async () => {
        const { result, rerender, navigateMock } = renderOwner({ selectedSessionId: null })

        await act(async () => {
            result.current.handleSelectSession('session-a')
            await vi.runAllTimersAsync()
        })

        expect(result.current.openingSessionId).toBe('session-a')

        rerender({
            api: null,
            navigate: navigateMock as unknown as PreloadOwnerOptions['navigate'],
            pathname: '/sessions/session-a',
            queryClient: {} as PreloadOwnerOptions['queryClient'],
            routeVisitRevision: 0,
            selectedSessionId: null,
        })

        expect(result.current.openingSessionId).toBeNull()
    })

    it('clears static pending navigation when the route path reaches the target', () => {
        const { result, rerender, navigateMock } = renderOwner({ selectedSessionId: null })

        act(() => {
            result.current.handleStaticRouteNavigation('settings')
        })

        expect(result.current.pendingStaticRouteId).toBe('settings')

        rerender({
            api: null,
            navigate: navigateMock as unknown as PreloadOwnerOptions['navigate'],
            pathname: '/sessions/settings',
            queryClient: {} as PreloadOwnerOptions['queryClient'],
            routeVisitRevision: 0,
            selectedSessionId: null,
        })

        expect(result.current.pendingStaticRouteId).toBeNull()
    })

    it('ignores the static route that is already active', () => {
        const { result, navigateMock } = renderOwner({ pathname: '/sessions/settings', selectedSessionId: null })

        act(() => {
            result.current.handleStaticRouteNavigation('settings')
        })

        expect(result.current.pendingStaticRouteId).toBeNull()
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('tracks static route navigation through the same pending navigation owner', () => {
        const { result } = renderOwner({ selectedSessionId: null })

        act(() => {
            result.current.handleStaticRouteNavigation('settings')
        })

        expect(result.current.openingSessionId).toBeNull()
        expect(result.current.pendingStaticRouteId).toBe('settings')
    })

    it('lets only the latest static pending target commit navigation', async () => {
        const settingsPreload = createDeferred()
        const newPreload = createDeferred()
        routePreloadMocks.loadSettingsRouteModule.mockReturnValueOnce(settingsPreload.promise)
        routePreloadMocks.loadNewSessionRouteModule.mockReturnValueOnce(newPreload.promise)
        const { result, navigateMock } = renderOwner({ selectedSessionId: null })

        act(() => {
            result.current.handleStaticRouteNavigation('settings')
            result.current.handleStaticRouteNavigation('new')
        })

        expect(result.current.pendingStaticRouteId).toBe('new')

        await act(async () => {
            settingsPreload.resolve()
            await settingsPreload.promise
        })

        expect(navigateMock).not.toHaveBeenCalled()

        await act(async () => {
            newPreload.resolve()
            await newPreload.promise
        })

        expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions/new' })
    })

    it('clears pending navigation when navigation diverts to a non-session route', async () => {
        const { result, rerender, navigateMock } = renderOwner({ selectedSessionId: 'session-a' })

        await act(async () => {
            result.current.handleSelectSession('session-b')
            await vi.runAllTimersAsync()
        })

        expect(result.current.openingSessionId).toBe('session-b')

        // user diverts to /sessions/new before the original session navigation commits → selectedSessionId becomes null
        rerender({
            api: null,
            navigate: navigateMock as unknown as PreloadOwnerOptions['navigate'],
            pathname: '/sessions/new',
            queryClient: {} as PreloadOwnerOptions['queryClient'],
            routeVisitRevision: 0,
            selectedSessionId: null,
        })

        // pending navigation must clear so the session card stops showing the opening state
        expect(result.current.openingSessionId).toBeNull()
    })
})
