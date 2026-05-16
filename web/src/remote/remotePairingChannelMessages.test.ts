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
        expect(onHeartbeat).toHaveBeenCalledOnce()
        expect(pending.resolveResponse).not.toHaveBeenCalled()
    })
})
