import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RemotePwaBootstrap } from './RemotePwaBootstrap'

const routerHistory = vi.hoisted(() => ({ replace: vi.fn() }))
const cookieRecover = vi.hoisted(() => vi.fn())
const cachedRecover = vi.hoisted(() => vi.fn())
const http = vi.hoisted(() => ({
    claimRemotePwaHandoff: vi.fn(),
    rememberRemotePairingId: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ history: routerHistory }) }))
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

describe('RemotePwaBootstrap', () => {
    beforeEach(() => {
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
