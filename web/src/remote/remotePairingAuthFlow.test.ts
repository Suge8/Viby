import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieRecoverMock = vi.hoisted(() => ({
    recoverRemotePairingFromCookie: vi.fn(),
}))

const httpMock = vi.hoisted(() => ({
    RemotePairingHttpError: class RemotePairingHttpError extends Error {
        readonly status: number

        constructor(status: number, message: string) {
            super(message)
            this.status = status
        }
    },
    claimRemotePwaHandoff: vi.fn(),
    getGuestToken: vi.fn((auth: { guestToken?: string }) => auth.guestToken ?? null),
    getPairingHandoffTicketFromLocation: vi.fn(),
    reconnectRemotePairing: vi.fn(),
    recoverRemotePairingByDevice: vi.fn(),
    scrubPairingLaunchSecretFromUrl: vi.fn(),
}))

vi.mock('@/remote/remotePairingCookieRecover', () => cookieRecoverMock)
vi.mock('@/remote/remotePairingHttp', () => httpMock)

import { resolveRemotePairingAuth } from './remotePairingAuthFlow'

function buildAuth(guestToken: string) {
    return { pairing: { id: 'pairing-1', approvalStatus: 'approved' }, guestToken }
}

describe('remotePairingAuthFlow', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        httpMock.getGuestToken.mockImplementation((auth: { guestToken?: string }) => auth.guestToken ?? null)
        httpMock.claimRemotePwaHandoff.mockResolvedValue(null)
        httpMock.getPairingHandoffTicketFromLocation.mockReturnValue(null)
        httpMock.recoverRemotePairingByDevice.mockResolvedValue(null)
        cookieRecoverMock.recoverRemotePairingFromCookie.mockResolvedValue({ ok: false, failure: { kind: 'missing' } })
    })

    it('returns null when no resume credential exists so the caller drops into verify-code', async () => {
        httpMock.reconnectRemotePairing.mockResolvedValue(null)
        await expect(resolveRemotePairingAuth('pairing-1')).resolves.toBeNull()
    })

    it('recovers a lost guest token with the stored device key before asking for a new QR', async () => {
        const recoveredAuth = buildAuth('guest-token-recovered')
        httpMock.reconnectRemotePairing.mockResolvedValue(null)
        httpMock.recoverRemotePairingByDevice.mockResolvedValue(recoveredAuth)

        await expect(resolveRemotePairingAuth('pairing-1')).resolves.toEqual({
            auth: recoveredAuth,
            token: 'guest-token-recovered',
        })
    })

    it('claims a PWA handoff before asking for a new QR', async () => {
        const handoffAuth = buildAuth('guest-token-pwa')
        httpMock.getPairingHandoffTicketFromLocation.mockReturnValue('handoff-ticket-1')
        httpMock.reconnectRemotePairing.mockResolvedValue(null)
        httpMock.claimRemotePwaHandoff.mockResolvedValue(handoffAuth)

        await expect(resolveRemotePairingAuth('pairing-1')).resolves.toEqual({
            auth: handoffAuth,
            token: 'guest-token-pwa',
        })
        expect(httpMock.claimRemotePwaHandoff).toHaveBeenCalledWith('pairing-1', 'handoff-ticket-1')
        expect(httpMock.scrubPairingLaunchSecretFromUrl).toHaveBeenCalledTimes(1)
    })

    it('recovers workspace refresh from the manifest cookie even without a handoff URL param', async () => {
        const recoveredAuth = buildAuth('guest-token-cookie')
        httpMock.reconnectRemotePairing.mockResolvedValue(null)
        httpMock.claimRemotePwaHandoff.mockResolvedValueOnce(recoveredAuth)
        cookieRecoverMock.recoverRemotePairingFromCookie.mockResolvedValue({
            ok: true,
            value: { pairingId: 'pairing-1', handoffTicket: 'fresh-cookie-ticket', expiresAt: 2_000 },
        })

        await expect(resolveRemotePairingAuth('pairing-1')).resolves.toEqual({
            auth: recoveredAuth,
            token: 'guest-token-cookie',
        })
        expect(httpMock.claimRemotePwaHandoff).toHaveBeenCalledWith('pairing-1', 'fresh-cookie-ticket')
    })

    it('recovers a stale launch handoff from the manifest cookie before showing rescan', async () => {
        const recoveredAuth = buildAuth('guest-token-cookie')
        httpMock.getPairingHandoffTicketFromLocation.mockReturnValue('stale-handoff-ticket')
        httpMock.reconnectRemotePairing.mockResolvedValue(null)
        httpMock.claimRemotePwaHandoff.mockRejectedValueOnce(new Error('remotePairing.error.scanAgain'))
        httpMock.claimRemotePwaHandoff.mockResolvedValueOnce(recoveredAuth)
        cookieRecoverMock.recoverRemotePairingFromCookie.mockResolvedValue({
            ok: true,
            value: { pairingId: 'pairing-1', handoffTicket: 'fresh-cookie-ticket', expiresAt: 2_000 },
        })

        await expect(resolveRemotePairingAuth('pairing-1')).resolves.toEqual({
            auth: recoveredAuth,
            token: 'guest-token-cookie',
        })
        expect(httpMock.claimRemotePwaHandoff).toHaveBeenNthCalledWith(1, 'pairing-1', 'stale-handoff-ticket')
        expect(httpMock.claimRemotePwaHandoff).toHaveBeenNthCalledWith(2, 'pairing-1', 'fresh-cookie-ticket')
        expect(httpMock.scrubPairingLaunchSecretFromUrl).toHaveBeenCalledTimes(1)
    })

    it('reconnects with a stored guest token without falling through to handoff', async () => {
        const reconnectedAuth = buildAuth('guest-token-reconnect')
        httpMock.reconnectRemotePairing.mockResolvedValue(reconnectedAuth)

        await expect(resolveRemotePairingAuth('pairing-1')).resolves.toEqual({
            auth: reconnectedAuth,
            token: 'guest-token-reconnect',
        })
        expect(httpMock.reconnectRemotePairing).toHaveBeenCalledWith('pairing-1')
    })
})
