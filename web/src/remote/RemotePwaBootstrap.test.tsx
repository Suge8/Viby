import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RemotePwaBootstrap, resolveRecoveredPairingHref } from './RemotePwaBootstrap'

const route = vi.hoisted(() => ({ href: '/sessions?remote=1' }))
const routerHistory = vi.hoisted(() => ({ replace: vi.fn() }))
const cookieRecover = vi.hoisted(() => vi.fn())
const cachedRecover = vi.hoisted(() => vi.fn())
const http = vi.hoisted(() => ({
    claimRemotePwaHandoff: vi.fn(),
    rememberRemotePairingId: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
    useLocation: ({ select }: { select: (location: { href: string }) => string }) => select(route),
    useRouter: () => ({ history: routerHistory }),
}))
vi.mock('@/lib/use-translation', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/runtimeDiagnostics', () => ({ reportWebRuntimeError: vi.fn() }))
vi.mock('./remotePairingCookieRecover', () => ({ recoverRemotePairingFromCookie: cookieRecover }))
vi.mock('./remotePairingDeviceRecovery', () => ({ recoverAnyRemotePairingByDevice: cachedRecover }))
vi.mock('./remotePairingHttp', () => http)
vi.mock('./RemotePairingScreens', () => ({
    RemotePairingMissingScreen: () => <div data-testid="missing">missing</div>,
    RemotePairingStatusScreen: (props: { message: string | null; onRetry?: () => void; phase?: string }) => (
        <div data-testid="status" data-phase={props.phase ?? ''}>
            {props.message ?? 'loading'}
            {props.onRetry ? (
                <button type="button" onClick={props.onRetry}>
                    retry
                </button>
            ) : null}
        </div>
    ),
}))

describe('resolveRecoveredPairingHref', () => {
    it('normalizes non-workspace launches to the remote sessions shell', () => {
        expect(resolveRecoveredPairingHref('/p/pairing-1?handoff=secret')).toBe('/sessions?remote=1')
    })

    it('preserves workspace deep links while normalizing remote intent', () => {
        expect(resolveRecoveredPairingHref('/sessions/session-1?Remote=1&tab=x#tail')).toBe(
            '/sessions/session-1?tab=x&remote=1#tail'
        )
    })
})

describe('RemotePwaBootstrap', () => {
    beforeEach(() => {
        route.href = '/sessions?remote=1'
        vi.clearAllMocks()
    })

    it('falls back from an invalid manifest cookie to server-verified cached device keys', async () => {
        cookieRecover.mockResolvedValue({ ok: false, failure: { kind: 'invalid' } })
        cachedRecover.mockResolvedValue({ pairing: { id: 'pairing-good', approvalStatus: 'approved' } })
        const onRecovered = vi.fn()

        render(<RemotePwaBootstrap fallbackPairingId="pairing-stale" onRecovered={onRecovered} />)

        await waitFor(() => expect(routerHistory.replace).toHaveBeenCalledWith('/sessions?remote=1'))
        expect(cachedRecover).toHaveBeenCalledWith('pairing-stale')
        expect(http.rememberRemotePairingId).toHaveBeenCalledWith('pairing-good')
        expect(onRecovered).toHaveBeenCalledWith('pairing-good')
        expect(screen.queryByTestId('missing')).toBeNull()
    })

    it('preserves the direct session route after broker cookie handoff', async () => {
        route.href = '/sessions/session-1?remote=1#tail'
        cookieRecover.mockResolvedValue({
            ok: true,
            value: { pairingId: 'pairing-cookie', handoffTicket: 'handoff-1', expiresAt: 1 },
        })
        http.claimRemotePwaHandoff.mockResolvedValue({ pairing: { id: 'pairing-cookie', approvalStatus: 'approved' } })

        render(<RemotePwaBootstrap fallbackPairingId={null} onRecovered={vi.fn()} />)

        await waitFor(() => expect(routerHistory.replace).toHaveBeenCalledWith('/sessions/session-1?remote=1#tail'))
    })

    it('uses the broker cookie handoff before cached-device recovery', async () => {
        cookieRecover.mockResolvedValue({
            ok: true,
            value: { pairingId: 'pairing-cookie', handoffTicket: 'handoff-1', expiresAt: 1 },
        })
        http.claimRemotePwaHandoff.mockResolvedValue({ pairing: { id: 'pairing-cookie', approvalStatus: 'approved' } })
        const onRecovered = vi.fn()

        render(<RemotePwaBootstrap fallbackPairingId="pairing-stale" onRecovered={onRecovered} />)

        await waitFor(() => expect(routerHistory.replace).toHaveBeenCalledWith('/sessions?remote=1'))
        expect(cachedRecover).not.toHaveBeenCalled()
        expect(http.claimRemotePwaHandoff).toHaveBeenCalledWith('pairing-cookie', 'handoff-1')
        expect(onRecovered).toHaveBeenCalledWith('pairing-cookie')
    })

    it('retries transient bootstrap recovery from the same owner', async () => {
        cookieRecover.mockResolvedValue({ ok: false, failure: { kind: 'transient' } })
        cachedRecover.mockRejectedValueOnce(new Error('idb busy')).mockResolvedValueOnce({
            pairing: { id: 'pairing-good', approvalStatus: 'approved' },
        })
        const onRecovered = vi.fn()

        render(<RemotePwaBootstrap fallbackPairingId="pairing-stale" onRecovered={onRecovered} />)

        fireEvent.click(await screen.findByRole('button', { name: 'retry' }))

        await waitFor(() => expect(onRecovered).toHaveBeenCalledWith('pairing-good'))
        expect(cachedRecover).toHaveBeenCalledTimes(2)
    })
})
