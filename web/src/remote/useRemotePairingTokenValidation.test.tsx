import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetBrowserRecoveryIntentForTests } from '@/lib/browserRecoveryIntent'
import type { RemotePairingReadyConnection } from './RemotePairingReadyShell'
import type { RemotePairingReconnectStatus } from './remotePairingViewModel'
import { useRemotePairingTokenValidation } from './useRemotePairingTokenValidation'

const validateRemotePairingToken = vi.hoisted(() => vi.fn(async () => undefined))
const clearRetainedReadySoon = vi.hoisted(() => vi.fn())

vi.mock('@/remote/remotePairingBoot', () => ({
    clearRetainedReadySoon,
}))

vi.mock('@/remote/remotePairingHttp', () => ({
    RemotePairingHttpError: class RemotePairingHttpError extends Error {
        readonly serverCode: string | null
        constructor(_status: number, message: string, _serverError: string | null, serverCode: string | null) {
            super(message)
            this.serverCode = serverCode
        }
    },
    validateRemotePairingToken,
}))

const ready: RemotePairingReadyConnection = {
    bridge: {} as RemotePairingReadyConnection['bridge'],
    token: 'token-1',
}

const reconnect: RemotePairingReconnectStatus = { attempt: 1, tone: 'warning' }

function renderValidationHook(): void {
    renderHook(() =>
        useRemotePairingTokenValidation({
            activeReady: ready,
            closeReady: vi.fn(),
            pairingId: 'pairing-1',
            reconnect,
            setConnectionReplaced: vi.fn(),
        })
    )
}

describe('useRemotePairingTokenValidation', () => {
    afterEach(() => {
        vi.clearAllMocks()
        vi.restoreAllMocks()
        resetBrowserRecoveryIntentForTests()
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'visible',
        })
    })

    it('coalesces focus and foreground visibility events into one token validation', async () => {
        renderValidationHook()

        await waitFor(() => expect(validateRemotePairingToken).toHaveBeenCalledTimes(1))
        await Promise.resolve()

        act(() => {
            window.dispatchEvent(new Event('focus'))
        })
        await Promise.resolve()
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'))
        })

        await waitFor(() => expect(validateRemotePairingToken.mock.calls.length).toBeGreaterThanOrEqual(2))
        await Promise.resolve()
        expect(validateRemotePairingToken).toHaveBeenCalledTimes(2)
        expect(validateRemotePairingToken).toHaveBeenLastCalledWith('pairing-1', 'token-1')
    })

    it('does not revalidate when network resumes while the document is hidden', async () => {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'hidden',
        })
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
        renderValidationHook()

        await waitFor(() => expect(validateRemotePairingToken).toHaveBeenCalledTimes(1))

        act(() => {
            window.dispatchEvent(new Event('online'))
        })
        await Promise.resolve()

        expect(validateRemotePairingToken).toHaveBeenCalledTimes(1)
    })

    it('does not start a duplicate validation while the same token is already in flight', async () => {
        validateRemotePairingToken.mockResolvedValueOnce(undefined)
        validateRemotePairingToken.mockImplementation(() => new Promise(() => undefined))
        renderValidationHook()

        await waitFor(() => expect(validateRemotePairingToken).toHaveBeenCalledTimes(1))
        await Promise.resolve()
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'))
        })
        await waitFor(() => expect(validateRemotePairingToken).toHaveBeenCalledTimes(2))

        act(() => {
            document.dispatchEvent(new Event('visibilitychange'))
        })
        await Promise.resolve()

        expect(validateRemotePairingToken).toHaveBeenCalledTimes(2)
    })
})
