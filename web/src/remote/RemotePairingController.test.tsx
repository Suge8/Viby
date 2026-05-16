import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { RemotePairingController } from './RemotePairingController'

const route = vi.hoisted(() => ({ pathname: '/sessions', href: '/sessions' }))
const auth = vi.hoisted(() => ({ value: null as unknown, resolve: vi.fn() }))
const retained = vi.hoisted(() => ({ value: null as { lastReadyAt: number } | null, reject: false }))
const clearRetainedReady = vi.hoisted(() => vi.fn(async () => undefined))
const setRetainedReady = vi.hoisted(() => vi.fn(async () => undefined))
const queryOnline = vi.hoisted(() => ({
    pause: vi.fn(),
    resume: vi.fn(),
}))
const session = vi.hoisted(() => ({
    onClose: null as null | ((error: Error) => void),
    transportListener: null as null | (() => void),
    untilReady: vi.fn(async () => undefined),
    close: vi.fn(),
    snapshot: { kind: 'connecting', attempt: 0 } as { kind: 'connecting'; attempt: number } | { kind: 'ready' },
}))

vi.mock('@tanstack/react-router', () => ({
    useRouter: () => ({ history: { replace: vi.fn() } }),
    useLocation: ({ select }: { select: (location: { pathname: string; href: string }) => string }) => select(route),
}))
vi.mock('@/hooks/useFinalizeBootShell', () => ({ useFinalizeBootShell: vi.fn() }))
vi.mock('@/lib/use-translation', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/notice-center', () => ({ useNoticeCenter: () => ({ addToast: vi.fn() }), usePersistentNotice: vi.fn() }))
vi.mock('@/remote/remotePairingQueryOnlineState', () => ({
    pauseRemotePairingQueries: queryOnline.pause,
    resumeRemotePairingQueries: queryOnline.resume,
}))
vi.mock('@/remote/remotePairingPwaHandoffWarmup', () => ({ useRemotePairingPwaHandoffWarmup: () => 'ready' }))
vi.mock('@/components/AppInstallPromptLayer', () => ({ AppInstallPromptLayer: () => <div data-testid="install" /> }))
vi.mock('@/remote/RemotePairingScreens', () => ({
    RemotePairingCodeScreen: () => <div data-testid="code" />,
    RemotePairingStatusScreen: () => <div data-testid="status" />,
}))
vi.mock('@/remote/RemotePairingReadyShell', () => ({
    RemotePairingReadyShell: () => <div data-testid="ready-shell" />,
}))
vi.mock('@/remote/RemotePairingHydrateSkeleton', () => ({
    RemotePairingHydrateSkeleton: () => <div data-testid="hydrate" />,
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

function approvedAuth() {
    return { auth: { pairing: { approvalStatus: 'approved' }, wsUrl: 'wss://broker', iceServers: [] }, token: 'token' }
}

function pendingAuth() {
    return { auth: { pairing: { approvalStatus: 'pending' }, wsUrl: 'wss://broker', iceServers: [] }, token: 'token' }
}

describe('RemotePairingController', () => {
    beforeEach(() => {
        route.pathname = '/sessions'
        route.href = '/sessions'
        retained.value = null
        retained.reject = false
        auth.resolve.mockResolvedValue(approvedAuth())
        clearRetainedReady.mockClear()
        setRetainedReady.mockClear()
        queryOnline.pause.mockClear()
        queryOnline.resume.mockClear()
        session.onClose = null
        session.transportListener = null
        session.snapshot = { kind: 'connecting', attempt: 0 }
        session.untilReady.mockResolvedValue(undefined)
        session.close.mockClear()
    })

    it('starts at hydrating and retained ready moves to running without status screen', async () => {
        retained.value = { lastReadyAt: 1 }
        renderController()
        expect(screen.getByTestId('hydrate')).toBeInTheDocument()
        await screen.findByTestId('ready-shell')
        expect(screen.queryByTestId('status')).not.toBeInTheDocument()
        expect(setRetainedReady).toHaveBeenCalledWith('pairing-1', expect.any(Number))
    })

    it('moves to running when retained ready exists', async () => {
        retained.value = { lastReadyAt: 1 }
        renderController()
        expect(await screen.findByTestId('ready-shell')).toBeInTheDocument()
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

    it('resumes remote queries when the transport leaves reconnecting state', async () => {
        renderController()
        await screen.findByTestId('ready-shell')
        await waitFor(() => expect(queryOnline.pause).toHaveBeenCalled())
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
        session.onClose?.(new Error('remotePairing.error.closedRetrying'))
        await waitFor(() => expect(clearRetainedReady).toHaveBeenCalledWith('pairing-1'))
        expect(await screen.findByTestId('status')).toBeInTheDocument()
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
