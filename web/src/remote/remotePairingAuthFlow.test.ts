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
    getGuestToken: vi.fn((auth: { guestToken?: string }) => auth.guestToken ?? null),
    getPairingTicketFromLocation: vi.fn(),
    reconnectRemotePairing: vi.fn(),
    scrubPairingTicketFromUrl: vi.fn(),
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
    })

    it('claims a fresh ticket when no stored reconnect token exists', async () => {
        const claimedAuth = buildAuth('guest-token-1')
        httpMock.getPairingTicketFromLocation.mockReturnValue('ticket-1')
        httpMock.reconnectRemotePairing.mockResolvedValue(null)
        httpMock.claimRemotePairing.mockResolvedValue(claimedAuth)

        await expect(resolveRemotePairingAuth('pairing-1')).resolves.toEqual({
            auth: claimedAuth,
            token: 'guest-token-1',
        })
        expect(httpMock.claimRemotePairing).toHaveBeenCalledWith('pairing-1', 'ticket-1')
        expect(httpMock.scrubPairingTicketFromUrl).toHaveBeenCalledTimes(1)
    })

    it('retries through claim after a non-recoverable reconnect error when a ticket is present', async () => {
        const claimedAuth = buildAuth('guest-token-2')
        httpMock.getPairingTicketFromLocation.mockReturnValue('ticket-2')
        httpMock.reconnectRemotePairing.mockRejectedValue(new Error('expired'))
        httpMock.claimRemotePairing.mockResolvedValue(claimedAuth)

        await expect(resolveRemotePairingAuth('pairing-1')).resolves.toEqual({
            auth: claimedAuth,
            token: 'guest-token-2',
        })
    })
})
