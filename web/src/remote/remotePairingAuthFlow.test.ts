import { beforeEach, describe, expect, it, vi } from 'vitest'

const httpMock = vi.hoisted(() => ({
    RemotePairingHttpError: class RemotePairingHttpError extends Error {
        readonly status: number

        constructor(status: number, message: string) {
            super(message)
            this.status = status
        }
    },
    claimRemotePairing: vi.fn(),
    claimRemotePwaHandoff: vi.fn(),
    getGuestToken: vi.fn((auth: { guestToken?: string }) => auth.guestToken ?? null),
    getPairingHandoffTicketFromLocation: vi.fn(),
    getPairingTicketFromLocation: vi.fn(),
    reconnectRemotePairing: vi.fn(),
    recoverRemotePairingByDevice: vi.fn(),
    scrubPairingLaunchSecretFromUrl: vi.fn(),
}))

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
    })

    it('claims a fresh ticket directly without attempting reconnect', async () => {
        const claimedAuth = buildAuth('guest-token-1')
        httpMock.getPairingTicketFromLocation.mockReturnValue('ticket-1')
        httpMock.claimRemotePairing.mockResolvedValue(claimedAuth)

        await expect(resolveRemotePairingAuth('pairing-1')).resolves.toEqual({
            auth: claimedAuth,
            token: 'guest-token-1',
        })
        expect(httpMock.reconnectRemotePairing).not.toHaveBeenCalled()
        expect(httpMock.claimRemotePairing).toHaveBeenCalledWith('pairing-1', 'ticket-1')
        expect(httpMock.scrubPairingLaunchSecretFromUrl).toHaveBeenCalledTimes(1)
    })

    it('recovers a lost guest token with the stored device key before asking for a new QR', async () => {
        const recoveredAuth = buildAuth('guest-token-recovered')
        httpMock.getPairingTicketFromLocation.mockReturnValue(null)
        httpMock.reconnectRemotePairing.mockResolvedValue(null)
        httpMock.recoverRemotePairingByDevice.mockResolvedValue(recoveredAuth)

        await expect(resolveRemotePairingAuth('pairing-1')).resolves.toEqual({
            auth: recoveredAuth,
            token: 'guest-token-recovered',
        })
        expect(httpMock.claimRemotePairing).not.toHaveBeenCalled()
    })

    it('claims a PWA handoff before asking for a new QR', async () => {
        const handoffAuth = buildAuth('guest-token-pwa')
        httpMock.getPairingTicketFromLocation.mockReturnValue(null)
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

    it('reconnects with stored token when no ticket is present', async () => {
        const reconnectedAuth = buildAuth('guest-token-reconnect')
        httpMock.getPairingTicketFromLocation.mockReturnValue(null)
        httpMock.reconnectRemotePairing.mockResolvedValue(reconnectedAuth)

        await expect(resolveRemotePairingAuth('pairing-1')).resolves.toEqual({
            auth: reconnectedAuth,
            token: 'guest-token-reconnect',
        })
        expect(httpMock.reconnectRemotePairing).toHaveBeenCalledWith('pairing-1')
        expect(httpMock.claimRemotePairing).not.toHaveBeenCalled()
    })
})
