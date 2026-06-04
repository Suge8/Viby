import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { RemotePairingController } from './RemotePairingController'

const route = vi.hoisted(() => ({ pathname: '/sessions', href: '/sessions' }))
const auth = vi.hoisted(() => ({ value: null as unknown, resolve: vi.fn() }))
const routerHistory = vi.hoisted(() => ({ replace: vi.fn() }))
const retained = vi.hoisted(() => ({ value: null as { lastReadyAt: number } | null, reject: false }))
const clearRetainedReady = vi.hoisted(() => vi.fn(async () => undefined))
const setRetainedReady = vi.hoisted(() => vi.fn(async () => undefined))
const persistentNotice = vi.hoisted(() => vi.fn())
const queryOnline = vi.hoisted(() => ({
    pause: vi.fn(),
    resume: vi.fn(),
}))
const runtimeDiagnostics = vi.hoisted(() => ({ report: vi.fn() }))
const RemotePairingHttpErrorMock = vi.hoisted(
    () =>
        class RemotePairingHttpError extends Error {
            readonly serverCode: string | null
            readonly status: number
            constructor(
                status: number,
                code: string,
                _serverError: string | null = null,
                serverCode: string | null = null
            ) {
                super(code)
                this.status = status
                this.serverCode = serverCode
            }
        }
)
const pwaWarmup = vi.hoisted(() => ({
    options: null as null | { onCredentialRejected?: () => void },
}))
const validateRemotePairingToken = vi.hoisted(() => vi.fn(async () => undefined))
const session = vi.hoisted(() => ({
    onClose: null as null | ((error: Error) => void),
    transportListener: null as null | (() => void),
    untilReady: vi.fn(async () => undefined),
    close: vi.fn(),
    snapshot: { kind: 'connecting', attempt: 0 } as { kind: 'connecting'; attempt: number } | { kind: 'ready' },
}))

vi.mock('@tanstack/react-router', () => ({
    useRouter: () => ({ history: routerHistory }),
    useLocation: ({ select }: { select: (location: { pathname: string; href: string }) => string }) => select(route),
}))
vi.mock('@/hooks/useFinalizeBootShell', () => ({ useFinalizeBootShell: vi.fn() }))
vi.mock('@/lib/use-translation', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/notice-center', () => ({
    useNoticeCenter: () => ({ addToast: vi.fn() }),
    usePersistentNotice: persistentNotice,
}))
vi.mock('@/lib/runtimeDiagnostics', () => ({ reportWebRuntimeError: runtimeDiagnostics.report }))
vi.mock('@/remote/remotePairingQueryOnlineState', () => ({
    pauseRemotePairingQueries: queryOnline.pause,
    resumeRemotePairingQueries: queryOnline.resume,
}))
vi.mock('@/remote/remotePairingPwaHandoffWarmup', () => ({
    useRemotePairingPwaHandoffWarmup: (options: { onCredentialRejected?: () => void }) => {
        pwaWarmup.options = options
        return 'ready'
    },
}))
vi.mock('@/components/AppInstallPromptLayer', () => ({ AppInstallPromptLayer: () => <div data-testid="install" /> }))
vi.mock('@/remote/RemotePairingScreens', () => ({
    RemotePairingCodeScreen: () => <div data-testid="code" />,
    RemotePairingStatusScreen: (props: { message: string | null; onRetry?: () => void; phase?: string }) => (
        <div data-testid="status" data-message={props.message ?? ''} data-phase={props.phase ?? ''}>
            {props.onRetry ? (
                <button type="button" data-testid="retry" onClick={props.onRetry}>
                    retry
                </button>
            ) : null}
        </div>
    ),
}))
vi.mock('@/remote/RemotePairingReadyShell', () => ({
    RemotePairingReadyShell: (props: {
        enableRuntime: boolean
        interactionBlocked: boolean
        linkBadgeOverride: { label: string; latency: string; tone: string } | null
        pathname: string
    }) => (
        <div
            data-testid="ready-shell"
            data-interaction-blocked={String(props.interactionBlocked)}
            data-link-label={props.linkBadgeOverride?.label ?? ''}
            data-link-tone={props.linkBadgeOverride?.tone ?? ''}
            data-runtime-enabled={String(props.enableRuntime)}
            data-pathname={props.pathname}
        />
    ),
}))
vi.mock('@/remote/RemotePairingPersistence', () => ({
    getRetainedReady: vi.fn(async () => {
        if (retained.reject) throw new Error('idb failed')
        return retained.value
    }),
    setRetainedReady,
    clearRetainedReady,
}))
vi.mock('@/remote/remotePairingAuthFlow', () => ({
    isRemotePairingApproved: (value: { pairing: { approvalStatus: string } }) =>
        value.pairing.approvalStatus === 'approved',
    resolveRemotePairingAuth: () => auth.resolve(),
}))
vi.mock('@/remote/remotePairingHttp', () => ({
    clearStoredGuestToken: vi.fn(),
    rememberRemotePairingId: vi.fn(),
    RemotePairingHttpError: RemotePairingHttpErrorMock,
    validateRemotePairingToken,
    verifyRemotePairingCode: vi.fn(),
}))
vi.mock('@/remote/RemotePeerSession', () => ({
    RemotePeerSession: vi.fn().mockImplementation(function RemotePeerSessionMock() {
        return {
            close: session.close,
            onClose: (listener: (error: Error) => void) => {
                session.onClose = listener
                return vi.fn()
            },
            untilReady: session.untilReady,
            transportSubscribe: (listener: () => void) => {
                session.transportListener = listener
                return vi.fn()
            },
            getSnapshot: () => session.snapshot,
        }
    }),
}))

function renderController(
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
): QueryClient {
    render(
        <QueryClientProvider client={queryClient}>
            <RemotePairingController pairingId="pairing-1" />
        </QueryClientProvider>
    )
    return queryClient
}

function findLatestReconnectNoticeCall() {
    for (let index = persistentNotice.mock.calls.length - 1; index >= 0; index -= 1) {
        const notice = persistentNotice.mock.calls[index]?.[0]
        if (notice?.id === 'pairing:remote-reconnecting') return notice
    }
    return null
}

function approvedAuth() {
    return {
        auth: {
            pairing: { approvalStatus: 'approved' },
            wsUrl: 'wss://broker',
            tunnelUrl: 'wss://tunnel',
            iceServers: [],
        },
        token: 'token',
    }
}

function pendingAuth() {
    return {
        auth: {
            pairing: { approvalStatus: 'pending' },
            wsUrl: 'wss://broker',
            tunnelUrl: 'wss://tunnel',
            iceServers: [],
        },
        token: 'token',
    }
}

describe('RemotePairingController', () => {
    beforeEach(() => {
        route.pathname = '/sessions'
        route.href = '/sessions'
        retained.value = null
        retained.reject = false
        auth.resolve.mockResolvedValue(approvedAuth())
        routerHistory.replace.mockClear()
        clearRetainedReady.mockClear()
        setRetainedReady.mockClear()
        persistentNotice.mockClear()
        queryOnline.pause.mockClear()
        queryOnline.resume.mockClear()
        runtimeDiagnostics.report.mockClear()
        pwaWarmup.options = null
        validateRemotePairingToken.mockReset()
        validateRemotePairingToken.mockResolvedValue(undefined)
        session.onClose = null
        session.transportListener = null
        session.snapshot = { kind: 'connecting', attempt: 0 }
        session.untilReady.mockReset()
        session.untilReady.mockResolvedValue(undefined)
        session.close.mockClear()
    })

    it('starts at hydrating and retained ready moves to running without status screen', async () => {
        retained.value = { lastReadyAt: 1 }
        renderController()
        expect(screen.getByTestId('status')).toHaveAttribute('data-phase', 'authenticating')
        await screen.findByTestId('ready-shell')
        expect(screen.queryByTestId('status')).not.toBeInTheDocument()
        expect(setRetainedReady).toHaveBeenCalledWith('pairing-1', expect.any(Number))
    })

    it('moves to running when retained ready exists', async () => {
        retained.value = { lastReadyAt: 1 }
        renderController()
        expect(await screen.findByTestId('ready-shell')).toHaveAttribute('data-runtime-enabled', 'true')
    })

    it('renders the retained workspace during `/p` handoff while the URL is normalized', async () => {
        route.pathname = '/p/pairing-1'
        route.href = '/p/pairing-1?handoff=handoff-ticket'

        renderController()

        await waitFor(() => expect(routerHistory.replace).toHaveBeenCalledWith('/sessions?remote=1&pairing=pairing-1'))
        expect(await screen.findByTestId('ready-shell')).toHaveAttribute('data-pathname', '/sessions')
        expect(screen.queryByTestId('status')).not.toBeInTheDocument()
        expect(persistentNotice.mock.calls.some(([notice]) => Boolean(notice))).toBe(false)
    })

    it('shows the connecting splash on first connect and reveals the workspace only after the peer channel is ready', async () => {
        // First-connect path: until the bridge transitions to ready, the
        // controller renders the connecting splash. The legacy implementation
        // exposed an empty `RemotePairingReadyShell` skeleton during this
        // window, which presented as a black page + floating link badge to
        // freshly-scanning phones.
        let resolveReady!: () => void
        session.untilReady.mockImplementation(
            () => new Promise<undefined>((resolve) => (resolveReady = () => resolve(undefined)))
        )
        renderController()

        await waitFor(() => expect(screen.getByTestId('status')).toHaveAttribute('data-phase', 'connecting-computer'))
        expect(screen.queryByTestId('ready-shell')).not.toBeInTheDocument()
        expect(persistentNotice.mock.calls.some(([notice]) => notice?.id === 'pairing:remote-reconnecting')).toBe(false)

        act(() => resolveReady())
        await waitFor(() => expect(screen.getByTestId('ready-shell')).toHaveAttribute('data-runtime-enabled', 'true'))
    })

    it('does not clear the remote runtime cache after transport readiness', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const runtimeResponse = { runtime: { id: 'remote-p2p', active: true } }
        queryClient.setQueryData(queryKeys.runtime, runtimeResponse)
        renderController(queryClient)
        await screen.findByTestId('ready-shell')
        await waitFor(() => expect(setRetainedReady).toHaveBeenCalled())
        expect(queryClient.getQueryData(queryKeys.runtime)).toBe(runtimeResponse)
    })

    it('does not block the ready workspace on retained-ready persistence', async () => {
        setRetainedReady.mockImplementationOnce(() => new Promise(() => undefined))
        session.snapshot = { kind: 'ready' }
        renderController()
        expect(await screen.findByTestId('ready-shell')).toHaveAttribute('data-runtime-enabled', 'true')
        await waitFor(() =>
            expect(screen.getByTestId('ready-shell')).toHaveAttribute('data-interaction-blocked', 'false')
        )
    })

    it('reports retained-ready persistence failures without hiding the workspace', async () => {
        setRetainedReady.mockRejectedValueOnce(new Error('idb write failed'))
        renderController()
        expect(await screen.findByTestId('ready-shell')).toHaveAttribute('data-runtime-enabled', 'true')
        await waitFor(() =>
            expect(runtimeDiagnostics.report).toHaveBeenCalledWith(
                'Failed to persist remote pairing ready marker.',
                expect.any(Error)
            )
        )
    })

    it('resumes remote queries when the transport leaves reconnecting state', async () => {
        renderController()
        await screen.findByTestId('ready-shell')
        await waitFor(() => expect(queryOnline.pause).toHaveBeenCalled())
        await waitFor(() => expect(screen.getByTestId('ready-shell')).toHaveAttribute('data-runtime-enabled', 'true'))
        queryOnline.pause.mockClear()
        queryOnline.resume.mockClear()

        act(() => {
            session.snapshot = { kind: 'ready' }
            session.transportListener?.()
        })

        await waitFor(() =>
            expect(queryOnline.resume).toHaveBeenCalledWith(expect.any(Object), {
                refetch: true,
            })
        )
        expect(queryOnline.pause).not.toHaveBeenCalled()
    })

    it('moves to first pairing when IDB and guest token are absent', async () => {
        route.pathname = '/p/pairing-1'
        route.href = '/p/pairing-1'
        auth.resolve.mockResolvedValue(pendingAuth())
        renderController()
        expect(await screen.findByTestId('code')).toBeInTheDocument()
        expect(screen.queryByTestId('status')).not.toBeInTheDocument()
    })

    it('falls back from IDB read failure without fatal screen', async () => {
        route.pathname = '/p/pairing-1'
        route.href = '/p/pairing-1'
        retained.reject = true
        auth.resolve.mockResolvedValue(pendingAuth())
        renderController()
        expect(await screen.findByTestId('code')).toBeInTheDocument()
        expect(screen.queryByTestId('status')).not.toBeInTheDocument()
    })

    it('clears retained ready when the session closes fatally', async () => {
        retained.value = { lastReadyAt: 1 }
        renderController()
        await screen.findByTestId('ready-shell')
        await waitFor(() => expect(session.onClose).toBeTruthy())
        act(() => session.onClose?.(new Error('remotePairing.error.closedRetrying')))
        await waitFor(() => expect(clearRetainedReady).toHaveBeenCalledWith('pairing-1'))
        expect(await screen.findByTestId('status')).toBeInTheDocument()
    })

    it('terminates a stale Safari reconnect when the broker says its token was replaced', async () => {
        validateRemotePairingToken.mockRejectedValueOnce(
            new RemotePairingHttpErrorMock(403, 'remotePairing.error.scanAgain', null, 'pairing_invalid_token')
        )
        session.snapshot = { kind: 'ready' }
        renderController()
        await screen.findByTestId('ready-shell')
        act(() => {
            session.snapshot = { kind: 'connecting', attempt: 3 }
            session.transportListener?.()
        })

        await waitFor(() =>
            expect(screen.getByTestId('status')).toHaveAttribute(
                'data-message',
                'remotePairing.error.connectionReplaced'
            )
        )
        expect(validateRemotePairingToken).toHaveBeenCalledWith('pairing-1', 'token')
        expect(session.close).toHaveBeenCalled()
        expect(screen.queryByTestId('ready-shell')).not.toBeInTheDocument()
    })

    it('terminates a stale Safari tab when PWA handoff warmup proves its token was replaced', async () => {
        session.snapshot = { kind: 'ready' }
        renderController()
        await screen.findByTestId('ready-shell')

        act(() => pwaWarmup.options?.onCredentialRejected?.())

        await waitFor(() =>
            expect(screen.getByTestId('status')).toHaveAttribute(
                'data-message',
                'remotePairing.error.connectionReplaced'
            )
        )
        expect(session.close).toHaveBeenCalled()
        expect(screen.queryByTestId('ready-shell')).not.toBeInTheDocument()
    })

    it('replaces the reconnecting workspace with a terminal handoff screen', async () => {
        session.snapshot = { kind: 'ready' }
        renderController()
        await screen.findByTestId('ready-shell')
        act(() => {
            session.snapshot = { kind: 'connecting', attempt: 3 }
            session.transportListener?.()
        })
        await waitFor(() => expect(findLatestReconnectNoticeCall()).toHaveProperty('tone', 'danger'))

        act(() => session.onClose?.(new Error('remotePairing.error.connectionReplaced')))

        await waitFor(() =>
            expect(screen.getByTestId('status')).toHaveAttribute(
                'data-message',
                'remotePairing.error.connectionReplaced'
            )
        )
        expect(screen.queryByTestId('ready-shell')).not.toBeInTheDocument()
        expect(persistentNotice.mock.calls.at(-1)?.[0]).toBeNull()
    })

    it('drops a half-open bridge when initial ready fails and retries from one owner', async () => {
        const firstError = new Error('remotePairing.error.closedRetrying')
        session.untilReady.mockRejectedValueOnce(firstError).mockResolvedValueOnce(undefined)
        renderController()

        await waitFor(() =>
            expect(screen.getByTestId('status')).toHaveAttribute('data-message', 'remotePairing.error.closedRetrying')
        )
        expect(screen.queryByTestId('ready-shell')).not.toBeInTheDocument()
        expect(session.close).toHaveBeenCalledTimes(1)

        fireEvent.click(screen.getByTestId('retry'))

        await screen.findByTestId('ready-shell')
        expect(session.untilReady).toHaveBeenCalledTimes(2)
        expect(setRetainedReady).toHaveBeenCalledWith('pairing-1', expect.any(Number))
    })

    it('blocks the ready shell while the running transport is reconnecting', async () => {
        session.snapshot = { kind: 'ready' }
        renderController()
        await screen.findByTestId('ready-shell')

        act(() => {
            session.snapshot = { kind: 'connecting', attempt: 3 }
            session.transportListener?.()
        })

        await waitFor(() =>
            expect(screen.getByTestId('ready-shell')).toHaveAttribute('data-interaction-blocked', 'true')
        )
        expect(queryOnline.pause).toHaveBeenCalled()
        expect(screen.getByTestId('ready-shell')).toHaveAttribute('data-link-tone', 'danger')
        expect(findLatestReconnectNoticeCall()).toHaveProperty('tone', 'danger')
    })

    it('clears retained ready through session dispose close', async () => {
        retained.value = { lastReadyAt: 1 }
        const { unmount } = render(
            <QueryClientProvider client={new QueryClient()}>
                <RemotePairingController pairingId="pairing-1" />
            </QueryClientProvider>
        )
        await screen.findByTestId('ready-shell')
        unmount()
        expect(session.close).toHaveBeenCalled()
        await waitFor(() => expect(clearRetainedReady).toHaveBeenCalledWith('pairing-1'))
    })
})
