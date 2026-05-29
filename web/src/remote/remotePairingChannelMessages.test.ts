import { createPairingPeerTextAssembler, splitPairingPeerTextMessage } from '@viby/protocol/pairing'
import { describe, expect, it, vi } from 'vitest'
import { handleRemotePeerChannelMessage } from './remotePairingChannelMessages'
import type { RemotePeerPendingRequests } from './remotePairingPendingRequests'

function pendingRequests(): RemotePeerPendingRequests {
    return {
        rejectAll: vi.fn(),
        request: vi.fn(),
        resolveResponse: vi.fn(),
    } as unknown as RemotePeerPendingRequests
}

describe('handleRemotePeerChannelMessage', () => {
    it('reassembles chunked peer responses before resolving RPCs', () => {
        const pending = pendingRequests()
        const response = JSON.stringify({ kind: 'response', id: 'r1', ok: true, result: { value: 'x'.repeat(128) } })
        const textAssembler = createPairingPeerTextAssembler()

        for (const frame of splitPairingPeerTextMessage(response, 32)) {
            handleRemotePeerChannelMessage({
                data: frame,
                textAssembler,
                pendingRequests: pending,
                syncListeners: new Set(),
                terminalListeners: new Set(),
            })
        }

        expect(pending.resolveResponse).toHaveBeenCalledWith({
            kind: 'response',
            id: 'r1',
            ok: true,
            result: { value: 'x'.repeat(128) },
        })
    })

    it('reports heartbeat acknowledgements without touching pending RPCs', () => {
        const pending = pendingRequests()
        const onHeartbeat = vi.fn()
        handleRemotePeerChannelMessage({
            data: JSON.stringify({ kind: 'heartbeat' }),
            pendingRequests: pending,
            syncListeners: new Set(),
            terminalListeners: new Set(),
            onHeartbeat,
        })
        expect(onHeartbeat).toHaveBeenCalledWith({ kind: 'heartbeat' })
        expect(pending.resolveResponse).not.toHaveBeenCalled()
    })
})
