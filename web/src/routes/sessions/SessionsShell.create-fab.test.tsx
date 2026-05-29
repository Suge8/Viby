import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_OVERLAY_ROOT_ELEMENT_ID } from '@/lib/overlayRoot'
import { SessionsShell } from './SessionsShell'

const navigateMock = vi.fn()
const useLocationMock = vi.fn()
const useMatchRouteMock = vi.fn()
const useSearchMock = vi.fn()
const useSessionsMock = vi.fn()
const loadAgentConfigRouteModuleMock = vi.fn(async () => undefined)
const loadNewSessionRouteModuleMock = vi.fn(async () => undefined)
const loadSettingsRouteModuleMock = vi.fn(async () => undefined)
const routerHistoryUnsubscribeMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
    Outlet: () => <div data-testid="outlet" />,
    useLocation: (options?: { select?: (location: { pathname: string }) => string }) => {
        const location = { pathname: useLocationMock() }
        return options?.select ? options.select(location) : location
    },
    useMatchRoute: () => useMatchRouteMock,
    useNavigate: () => navigateMock,
    useRouter: () => ({ history: { subscribe: () => routerHistoryUnsubscribeMock } }),
    useSearch: () => useSearchMock(),
}))

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({ prefetchQuery: vi.fn() }),
}))

vi.mock('@/components/SessionList', () => ({
    SessionList: () => <div data-testid="session-list" />,
}))

vi.mock('@/components/SessionsEmptyState', () => ({
    SessionsEmptyState: () => <div data-testid="sessions-empty-state" />,
}))

vi.mock('@/hooks/queries/sessionViewRuntime', () => ({
    disposeSessionViewRuntime: vi.fn(),
}))

vi.mock('@/hooks/queries/useSessions', () => ({
    useSessions: (...args: unknown[]) => useSessionsMock(...args),
}))

vi.mock('@/hooks/useFinalizeBootShell', () => ({
    useFinalizeBootShell: vi.fn(),
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: null,
    }),
}))

vi.mock('@/lib/navigationTransition', () => ({
    runPreloadedNavigation: async (preload: (() => Promise<unknown>) | Promise<unknown>, commit: () => void) => {
        try {
            await (typeof preload === 'function' ? preload() : preload)
        } catch {}
        commit()
    },
}))

vi.mock('@/lib/networkPreloadPolicy', () => ({
    SESSIONS_IDLE_PRELOAD_DELAY_MS: 50,
    getNetworkInformation: () => null,
    shouldPreloadIdleSessionRoutes: () => false,
}))

vi.mock('@/lib/notice-center', () => ({
    useNoticeCenter: () => ({ addToast: vi.fn() }),
}))

vi.mock('@/lib/noticePresets', () => ({
    getNoticePreset: () => ({
        title: 'Something went wrong',
        tone: 'danger',
    }),
}))

vi.mock('@/lib/sessionEntryPreference', () => ({
    readLastOpenedSessionId: () => null,
    writeLastOpenedSessionId: vi.fn(),
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

vi.mock('@/routes/sessions/components/SessionsShellHeader', () => ({
    SessionsShellHeader: () => <div data-testid="sessions-shell-header" />,
}))

vi.mock('@/routes/sessions/sessionDetailRoutePreload', () => ({
    preloadSessionDetailCriticalRoute: vi.fn(async () => undefined),
    preloadSessionDetailIntent: vi.fn(),
    preloadSessionDetailRoute: vi.fn(async () => undefined),
    warmSessionDetailAncillaryRouteData: vi.fn(),
}))

vi.mock('@/routes/sessions/sessionRoutePreload', () => ({
    SESSIONS_IDLE_PRELOADERS: [],
    loadAgentConfigRouteModule: () => loadAgentConfigRouteModuleMock(),
    loadNewSessionRouteModule: () => loadNewSessionRouteModuleMock(),
    loadSettingsRouteModule: () => loadSettingsRouteModuleMock(),
}))

function mockMatchMedia(desktop: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn().mockImplementation(() => ({
            matches: desktop,
            media: '(min-width: 1024px)',
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    })
}

describe('SessionsShell create FAB', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        navigateMock.mockReset()
        useLocationMock.mockReturnValue('/sessions')
        useMatchRouteMock.mockReturnValue(false)
        useSearchMock.mockReturnValue({ section: undefined })
        useSessionsMock.mockReturnValue({
            sessions: [{ id: 'session-1' }],
            error: null,
        })
    })

    it('mounts the mobile create button inside the single overlay root', () => {
        mockMatchMedia(false)
        render(<SessionsShell />)

        const overlayRoot = document.getElementById(APP_OVERLAY_ROOT_ELEMENT_ID)
        const createButton = screen.getByRole('button', { name: 'sessions.new' })
        expect(overlayRoot).not.toBeNull()
        expect(overlayRoot?.contains(createButton)).toBe(true)
        expect(createButton.parentElement?.className).toContain('justify-end')
        expect(createButton.parentElement?.className).toContain('ds-sessions-create-fab-wrapper')
        expect(createButton.className).toContain('pointer-events-auto')
    })

    it('mounts the desktop create button inside the same overlay root', () => {
        mockMatchMedia(true)
        render(<SessionsShell />)

        const overlayRoot = document.getElementById(APP_OVERLAY_ROOT_ELEMENT_ID)
        const createButton = screen.getByRole('button', { name: 'sessions.new' })
        expect(overlayRoot?.contains(createButton)).toBe(true)
        expect(createButton.parentElement?.className).toContain('ds-sessions-create-fab-wrapper')
    })
})
