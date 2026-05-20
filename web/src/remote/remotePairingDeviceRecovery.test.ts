import { beforeEach, describe, expect, it, vi } from 'vitest'

const device = vi.hoisted(() => ({ listCachedPairingDeviceIds: vi.fn() }))
const http = vi.hoisted(() => {
    class RemotePairingHttpError extends Error {
        constructor(
            readonly status: number,
            readonly code: string,
            readonly serverError: string | null = null,
            readonly serverCode: string | null = null
        ) {
            super(code)
        }
    }
    return {
        RemotePairingHttpError,
        reconnectRemotePairing: vi.fn(),
        recoverRemotePairingByDevice: vi.fn(),
    }
})

vi.mock('@/remote/remotePairingDevice', () => device)
vi.mock('@/remote/remotePairingHttp', () => http)

import { recoverAnyRemotePairingByDevice } from './remotePairingDeviceRecovery'

describe('recoverAnyRemotePairingByDevice', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        device.listCachedPairingDeviceIds.mockResolvedValue(['pairing-stale', 'pairing-good'])
        http.reconnectRemotePairing.mockResolvedValue(null)
    })

    it('skips stale terminal credentials and returns the first server-approved cached identity', async () => {
        http.recoverRemotePairingByDevice
            .mockRejectedValueOnce(
                new http.RemotePairingHttpError(
                    403,
                    'remotePairing.error.scanAgain',
                    null,
                    'pairing_invalid_device_proof'
                )
            )
            .mockResolvedValueOnce({ pairing: { id: 'pairing-good', approvalStatus: 'approved' } })

        await expect(recoverAnyRemotePairingByDevice('pairing-stale')).resolves.toMatchObject({
            pairing: { id: 'pairing-good' },
        })
        expect(http.recoverRemotePairingByDevice).toHaveBeenNthCalledWith(1, 'pairing-stale')
        expect(http.recoverRemotePairingByDevice).toHaveBeenNthCalledWith(2, 'pairing-good')
    })

    it('preserves transient broker failures instead of hiding them as missing pairing state', async () => {
        http.recoverRemotePairingByDevice.mockRejectedValue(
            new http.RemotePairingHttpError(503, 'remotePairing.error.closedRetrying')
        )

        await expect(recoverAnyRemotePairingByDevice('pairing-stale')).rejects.toMatchObject({ status: 503 })
    })
})
