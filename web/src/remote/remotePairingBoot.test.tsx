import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { type RemotePairingAuthResult, useRemotePairingBoot } from './remotePairingBoot'

const resolveRemotePairingAuth = vi.hoisted(() => vi.fn())
const rememberRemotePairingId = vi.hoisted(() => vi.fn())

vi.mock('@/remote/RemotePairingPersistence', () => ({
    clearRetainedReady: vi.fn(),
    getRetainedReady: vi.fn(),
}))
vi.mock('@/remote/remotePairingAuthFlow', () => ({
    isRemotePairingApproved: (auth: { pairing: { approvalStatus: string } }) =>
        auth.pairing.approvalStatus === 'approved',
    resolveRemotePairingAuth,
}))
vi.mock('@/remote/remotePairingHttp', () => ({
    rememberRemotePairingId,
}))

type StartSession = Parameters<typeof useRemotePairingBoot>[0]['startSession']

function BootHarness(props: { startSession: StartSession }) {
    useRemotePairingBoot({
        bootAttempt: 0,
        initialAuth: {
            auth: {
                guestToken: 'token-1',
                iceServers: [],
                pairing: { id: 'pairing-1', approvalStatus: 'approved' },
                tunnelUrl: 'https://pair.test/tunnel',
                wsUrl: 'wss://pair.test/ws',
            },
            token: 'token-1',
        } as unknown as RemotePairingAuthResult,
        pairingId: 'pairing-1',
        setState: vi.fn(),
        startSession: props.startSession,
    })
    return null
}

describe('useRemotePairingBoot', () => {
    it('starts from bootstrap auth without a second reconnect resolve', async () => {
        const startSession = vi.fn().mockResolvedValue({ bridge: {}, token: 'token-1' })

        render(<BootHarness startSession={startSession as unknown as StartSession} />)

        await waitFor(() => expect(startSession).toHaveBeenCalledTimes(1))
        expect(startSession).toHaveBeenCalledWith(expect.objectContaining({ guestToken: 'token-1' }), 'token-1')
        expect(resolveRemotePairingAuth).not.toHaveBeenCalled()
        expect(rememberRemotePairingId).toHaveBeenCalledWith('pairing-1')
    })
})
