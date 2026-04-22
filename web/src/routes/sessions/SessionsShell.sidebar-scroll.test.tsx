import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSIONS_LIST_SCROLLER_TEST_ID } from '@/lib/sessionUiContracts'
import { SessionsShell } from './SessionsShell'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
    Outlet: () => <div data-testid="outlet" />,
    useLocation: (options?: { select?: (location: { pathname: string }) => string }) => {
        const location = { pathname: '/sessions' }
        return options?.select ? options.select(location) : location
    },
    useMatchRoute: () => () => false,
    useNavigate: () => navigateMock,
    useSearch: () => ({ section: undefined }),
}))

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({}),
}))

vi.mock('@/components/SessionList', () => ({
    SessionList: () => <div data-testid="session-list" />,
}))

vi.mock('@/components/SessionsEmptyState', () => ({
    SessionsEmptyState: () => <div data-testid="sessions-empty-state" />,
}))

vi.mock('@/hooks/queries/useSessions', () => ({
    useSessions: () => ({
        sessions: [],
        error: null,
        isLoading: false,
    }),
}))

vi.mock('@/hooks/useDesktopSessionsLayout', () => ({
    useDesktopSessionsLayout: () => true,
}))

vi.mock('@/hooks/useFinalizeBootShell', () => ({
    useFinalizeBootShell: () => undefined,
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: null,
    }),
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

vi.mock('@/routes/sessions/components/SessionsMobileCreateButton', () => ({
    SessionsMobileCreateButton: () => null,
}))

vi.mock('@/routes/sessions/components/SessionsShellHeader', () => ({
    SessionsShellHeader: () => <div data-testid="sessions-shell-header" />,
}))

vi.mock('@/routes/sessions/sessionRoutePreload', () => ({
    loadNewSessionRouteModule: () => Promise.resolve(undefined),
    loadSettingsRouteModule: () => Promise.resolve(undefined),
}))

vi.mock('@/routes/sessions/useSessionsShellPreloadOwner', () => ({
    useSessionsShellPreloadOwner: () => ({
        handleSelectSession: vi.fn(),
        handleSessionIntent: vi.fn(),
    }),
}))

describe('SessionsShell sidebar scroller', () => {
    beforeEach(() => {
        navigateMock.mockReset()
    })

    it('keeps a single vertical scroller without horizontal overflow or forced rails', () => {
        render(<SessionsShell />)

        const listScroller = screen.getByTestId(SESSIONS_LIST_SCROLLER_TEST_ID)

        expect(listScroller).toHaveClass('desktop-scrollbar-stable')
        expect(listScroller).toHaveClass('overflow-x-hidden')
        expect(listScroller).toHaveClass('overflow-y-auto')
        expect(listScroller).not.toHaveClass('lg:overflow-y-scroll')
    })
})
