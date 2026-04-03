import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import { recordPendingAppRecovery } from '@/lib/appRecovery'
import { resetPendingRuntimeUpdate } from '@/lib/runtimeUpdateChannel'

const useMatchRouteMock = vi.fn()
const useLocationMock = vi.fn()
const useRouterMock = vi.fn()
const useQueryClientMock = vi.fn()
const initializeThemeMock = vi.fn()
const useServerUrlMock = vi.fn()
const useAuthSourceMock = vi.fn()
const useAuthMock = vi.fn()
const useRealtimeFeedbackMock = vi.fn()
const useRealtimeConnectionMock = vi.fn<(options: unknown) => void>()
const usePushNotificationsMock = vi.fn()
const runRealtimeRecoveryMock = vi.fn<(options: unknown) => Promise<void>>(() => Promise.resolve())
const addToastMock = vi.fn()
const clearAuthMock = vi.fn()
const installPromptPropsMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
    Outlet: () => <div data-testid="outlet" />,
    useMatchRoute: () => useMatchRouteMock(),
    useLocation: () => useLocationMock(),
    useRouter: () => useRouterMock(),
}))

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => useQueryClientMock(),
}))

vi.mock('@/hooks/useTheme', () => ({
    initializeTheme: () => initializeThemeMock(),
}))

vi.mock('@/hooks/useServerUrl', () => ({
    useServerUrl: () => useServerUrlMock(),
}))

vi.mock('@/hooks/useAuthSource', () => ({
    useAuthSource: () => useAuthSourceMock(),
}))

vi.mock('@/hooks/useAuth', () => ({
    useAuth: () => useAuthMock(),
}))

vi.mock('@/hooks/useRealtimeFeedback', () => ({
    useRealtimeFeedback: () => useRealtimeFeedbackMock(),
}))

vi.mock('@/hooks/useRealtimeConnection', () => ({
    useRealtimeConnection: (options: unknown) => useRealtimeConnectionMock(options),
}))

vi.mock('@/hooks/usePushNotifications', () => ({
    usePushNotifications: () => usePushNotificationsMock(),
}))

vi.mock('@/lib/realtimeRecovery', () => ({
    runRealtimeRecovery: (options: unknown) => runRealtimeRecoveryMock(options),
}))

vi.mock('@/lib/runtime-config', () => ({
    requireHubUrlForLogin: () => false,
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/app-context', () => ({
    AppContextProvider: (props: { children: React.ReactNode }) => <>{props.children}</>,
}))

vi.mock('@/lib/notice-center', () => ({
    NoticeProvider: (props: { children: React.ReactNode }) => <>{props.children}</>,
    useNoticeCenter: () => ({ addToast: addToastMock }),
}))

vi.mock('@/components/LoginPrompt', () => ({
    LoginPrompt: (props: { error?: string | null }) => (
        <div data-testid="login-prompt">{props.error ?? 'no-error'}</div>
    ),
}))

vi.mock('@/components/InstallPrompt', () => ({
    InstallPrompt: (props: unknown) => {
        installPromptPropsMock(props)
        return null
    },
}))

vi.mock('@/components/AppFloatingNoticeLayer', () => ({
    AppFloatingNoticeLayer: () => null,
}))

vi.mock('@/components/LoadingState', () => ({
    LoadingState: (props: { label?: string }) => <div data-testid="loading-state">{props.label}</div>,
}))

type RealtimeConnectHandler = (details: {
    initial: boolean
    recovered: boolean
    transport: string | null
}) => void

function getRealtimeConnectHandler(): RealtimeConnectHandler {
    const realtimeOptions = useRealtimeConnectionMock.mock.calls.at(-1)?.[0] as {
        onConnect: RealtimeConnectHandler
    } | undefined

    if (!realtimeOptions) {
        throw new Error('Expected useRealtimeConnection to be called before reading onConnect')
    }

    return realtimeOptions.onConnect
}

describe('App', () => {
    afterEach(() => {
        cleanup()
        resetPendingRuntimeUpdate()
    })

    beforeEach(() => {
        useMatchRouteMock.mockReturnValue(() => null)
        useLocationMock.mockReturnValue('/')
        useRouterMock.mockReturnValue({
            history: {
                location: { pathname: '/', search: '', hash: '', state: null },
                replace: vi.fn(),
            }
        })
        useQueryClientMock.mockReturnValue({
            clear: vi.fn(),
            invalidateQueries: vi.fn(() => Promise.resolve()),
        })
        useServerUrlMock.mockReturnValue({
            serverUrl: null,
            baseUrl: 'http://hub.test',
            setServerUrl: vi.fn(),
            clearServerUrl: vi.fn(),
        })
        useAuthSourceMock.mockReturnValue({
            authSource: { type: 'accessToken', token: 'bad-token' },
            setAccessToken: vi.fn(),
            clearAuth: clearAuthMock,
        })
        useRealtimeFeedbackMock.mockReturnValue({
            banner: { kind: 'hidden' },
            handleConnect: vi.fn(),
            handleDisconnect: vi.fn(),
            handleConnectError: vi.fn(),
            announceRecovery: vi.fn(),
            runCatchupSync: vi.fn(),
        })
        usePushNotificationsMock.mockReturnValue({
            isSupported: false,
            permission: 'default',
            ensureSubscription: vi.fn(),
        })
        addToastMock.mockReset()
        clearAuthMock.mockReset()
        useRealtimeConnectionMock.mockReset()
        runRealtimeRecoveryMock.mockReset()
        runRealtimeRecoveryMock.mockImplementation(() => Promise.resolve())
        initializeThemeMock.mockReset()
        installPromptPropsMock.mockReset()
    })

    it('shows the login prompt when authentication returns an error', async () => {
        useAuthMock.mockReturnValue({
            token: null,
            api: null,
            isLoading: false,
            error: 'Session expired. Please login again.',
        })

        render(<App />)

        expect(await screen.findByTestId('login-prompt')).toHaveTextContent('Session expired. Please login again.')
        expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
    })

    it('clears stale access token sources after auth 401 errors', async () => {
        useAuthMock.mockReturnValue({
            token: null,
            api: null,
            isLoading: false,
            error: 'Auth failed: HTTP 401 Unauthorized: {"error":"Invalid access token"}',
        })

        render(<App />)

        expect(clearAuthMock).toHaveBeenCalledTimes(1)
        expect(await screen.findByTestId('login-prompt')).toHaveTextContent('Auth failed: HTTP 401 Unauthorized: {"error":"Invalid access token"}')
    })

    it('suppresses the install banner while app recovery is restoring the session', async () => {
        useAuthMock.mockReturnValue({
            token: 'session-token',
            api: {} as object,
            isLoading: false,
            error: null,
        })
        useRealtimeFeedbackMock.mockReturnValue({
            banner: { kind: 'restoring', reason: 'page-restored' },
            handleConnect: vi.fn(),
            handleDisconnect: vi.fn(),
            handleConnectError: vi.fn(),
            announceRecovery: vi.fn(),
            runCatchupSync: vi.fn(),
        })

        render(<App />)

        await waitFor(() => {
            expect(installPromptPropsMock).not.toHaveBeenCalled()
        })
        expect(screen.getByTestId('outlet')).toBeInTheDocument()
    })

    it('suppresses the install banner while realtime reconnect chrome is active', async () => {
        useAuthMock.mockReturnValue({
            token: 'session-token',
            api: {} as object,
            isLoading: false,
            error: null,
        })
        useRealtimeFeedbackMock.mockReturnValue({
            banner: { kind: 'busy' },
            handleConnect: vi.fn(),
            handleDisconnect: vi.fn(),
            handleConnectError: vi.fn(),
            announceRecovery: vi.fn(),
            runCatchupSync: vi.fn(),
        })

        render(<App />)

        await waitFor(() => {
            expect(installPromptPropsMock).not.toHaveBeenCalled()
        })
        expect(screen.getByTestId('outlet')).toBeInTheDocument()
    })

    it('only loads the install prompt when app chrome is idle again', async () => {
        useAuthMock.mockReturnValue({
            token: 'session-token',
            api: {} as object,
            isLoading: false,
            error: null,
        })
        useRealtimeFeedbackMock.mockReturnValue({
            banner: { kind: 'hidden' },
            handleConnect: vi.fn(),
            handleDisconnect: vi.fn(),
            handleConnectError: vi.fn(),
            announceRecovery: vi.fn(),
            runCatchupSync: vi.fn(),
        })

        render(<App />)

        await waitFor(() => {
            expect(installPromptPropsMock).toHaveBeenLastCalledWith({
                suppressed: false
            })
        })
    })

    it('renders the app shell immediately when a session token is already ready, even without an auth source', async () => {
        useAuthSourceMock.mockReturnValue({
            authSource: null,
            setAccessToken: vi.fn(),
            clearAuth: clearAuthMock,
        })
        useAuthMock.mockReturnValue({
            token: 'session-token',
            api: {} as object,
            isLoading: false,
            error: null,
        })

        render(<App />)

        expect(screen.getByTestId('outlet')).toBeInTheDocument()
        expect(screen.queryByTestId('login-prompt')).not.toBeInTheDocument()
        expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
    })

    it('does not block the app shell on background auth loading when a ready session already exists', async () => {
        useAuthMock.mockReturnValue({
            token: 'session-token',
            api: {} as object,
            isLoading: true,
            error: null,
        })

        render(<App />)

        expect(screen.getByTestId('outlet')).toBeInTheDocument()
        expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
    })

    it('keeps auth refresh neutral when no ready session exists yet', () => {
        useAuthMock.mockReturnValue({
            token: null,
            api: null,
            isLoading: true,
            error: null,
        })

        const { container } = render(<App />)

        expect(container).toBeEmptyDOMElement()
        expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
        expect(screen.queryByTestId('login-prompt')).not.toBeInTheDocument()
    })

    it('restores the intended href after a recovery reload consumed the navigation target', () => {
        const replaceMock = vi.fn()
        const announceRecoveryMock = vi.fn()

        useRouterMock.mockReturnValue({
            history: {
                location: { pathname: '/sessions', search: '', hash: '', state: { from: 'test' } },
                replace: replaceMock,
            }
        })
        useAuthMock.mockReturnValue({
            token: 'session-token',
            api: {} as object,
            isLoading: false,
            error: null,
        })
        useRealtimeFeedbackMock.mockReturnValue({
            banner: { kind: 'hidden' },
            handleConnect: vi.fn(),
            handleDisconnect: vi.fn(),
            handleConnectError: vi.fn(),
            announceRecovery: announceRecoveryMock,
            runCatchupSync: vi.fn(),
        })
        recordPendingAppRecovery('vite-preload-error', {
            resumeHref: '/sessions/session-1'
        })

        render(<App />)

        expect(replaceMock).toHaveBeenCalledWith('/sessions/session-1', { from: 'test' })
        expect(announceRecoveryMock).toHaveBeenCalledWith('vite-preload-error')
    })

    it('marks mobile chat routes on html and body as the viewport owner fact source', async () => {
        useLocationMock.mockReturnValue('/sessions/session-1')
        useAuthMock.mockReturnValue({
            token: 'session-token',
            api: {} as object,
            isLoading: false,
            error: null,
        })

        render(<App />)

        await waitFor(() => {
            expect(document.documentElement.dataset.vibyRoute).toBe('session-chat')
            expect(document.body.dataset.vibyRoute).toBe('session-chat')
        })
    })

    it('runs authoritative reconnect recovery even when the socket reports recovered', async () => {
        const api = {} as object
        const runCatchupSyncMock = vi.fn((task: Promise<unknown>) => task)

        useMatchRouteMock.mockReturnValue(() => ({ sessionId: 'session-1' }))
        useAuthMock.mockReturnValue({
            token: 'session-token',
            api,
            isLoading: false,
            error: null,
        })
        useRealtimeFeedbackMock.mockReturnValue({
            banner: { kind: 'hidden' },
            handleConnect: vi.fn(),
            handleDisconnect: vi.fn(),
            handleConnectError: vi.fn(),
            announceRecovery: vi.fn(),
            runCatchupSync: runCatchupSyncMock,
        })

        render(<App />)

        await waitFor(() => {
            expect(useRealtimeConnectionMock).toHaveBeenCalled()
        })

        getRealtimeConnectHandler()({ initial: false, recovered: true, transport: 'websocket' })

        await waitFor(() => {
            expect(runCatchupSyncMock).toHaveBeenCalledTimes(1)
            expect(runRealtimeRecoveryMock).toHaveBeenCalledWith(expect.objectContaining({
                api,
                selectedSessionId: 'session-1'
            }))
        })
    })

    it('runs authoritative reconnect recovery after an ordinary reconnect', async () => {
        const api = {} as object
        const runCatchupSyncMock = vi.fn((task: Promise<unknown>) => task)

        useAuthMock.mockReturnValue({
            token: 'session-token',
            api,
            isLoading: false,
            error: null,
        })
        useRealtimeFeedbackMock.mockReturnValue({
            banner: { kind: 'hidden' },
            handleConnect: vi.fn(),
            handleDisconnect: vi.fn(),
            handleConnectError: vi.fn(),
            announceRecovery: vi.fn(),
            runCatchupSync: runCatchupSyncMock,
        })

        render(<App />)

        await waitFor(() => {
            expect(useRealtimeConnectionMock).toHaveBeenCalled()
        })

        getRealtimeConnectHandler()({ initial: false, recovered: false, transport: 'websocket' })

        await waitFor(() => {
            expect(runCatchupSyncMock).toHaveBeenCalledTimes(1)
            expect(runRealtimeRecoveryMock).toHaveBeenCalledWith(expect.objectContaining({
                api,
                selectedSessionId: null
            }))
        })
    })

    it('skips reconnect recovery on the first realtime connect', async () => {
        const runCatchupSyncMock = vi.fn((task: Promise<unknown>) => task)

        useAuthMock.mockReturnValue({
            token: 'session-token',
            api: {} as object,
            isLoading: false,
            error: null,
        })
        useRealtimeFeedbackMock.mockReturnValue({
            banner: { kind: 'hidden' },
            handleConnect: vi.fn(),
            handleDisconnect: vi.fn(),
            handleConnectError: vi.fn(),
            announceRecovery: vi.fn(),
            runCatchupSync: runCatchupSyncMock,
        })

        render(<App />)

        await waitFor(() => {
            expect(useRealtimeConnectionMock).toHaveBeenCalled()
        })

        getRealtimeConnectHandler()({ initial: true, recovered: false, transport: 'websocket' })

        await waitFor(() => {
            expect(runCatchupSyncMock).not.toHaveBeenCalled()
            expect(runRealtimeRecoveryMock).not.toHaveBeenCalled()
        })
    })

    it('only maintains an existing granted notification subscription without auto-requesting permission', async () => {
        const ensureSubscriptionMock = vi.fn().mockResolvedValue(true)

        useAuthMock.mockReturnValue({
            token: 'session-token',
            api: {} as object,
            isLoading: false,
            error: null,
        })
        usePushNotificationsMock.mockReturnValue({
            isSupported: true,
            permission: 'granted',
            ensureSubscription: ensureSubscriptionMock,
        })

        render(<App />)

        await waitFor(() => {
            expect(ensureSubscriptionMock).toHaveBeenCalledTimes(1)
        })
    })
})
