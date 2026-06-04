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

    it('drops duplicate and old sync events through the seq guard', () => {
        const pending = pendingRequests()
        const syncListener = vi.fn()
        const acceptEventSeq = vi.fn((seq: number) => seq > 2)

        for (const seq of [2, 1, 3]) {
            handleRemotePeerChannelMessage({
                data: JSON.stringify({
                    kind: 'event',
                    event: 'sync-event',
                    seq,
                    payload: { type: 'machine-updated', machineId: `m${seq}` },
                }),
                pendingRequests: pending,
                syncListeners: new Set([syncListener]),
                terminalListeners: new Set(),
                acceptEventSeq,
            })
        }

        expect(syncListener).toHaveBeenCalledTimes(1)
        expect(syncListener).toHaveBeenCalledWith({ type: 'machine-updated', machineId: 'm3' })
    })

    it('forces snapshot invalidation through duplicate seq guards', () => {
        const pending = pendingRequests()
        const syncListener = vi.fn()
        const acceptEventSeq = vi.fn(() => true)
        handleRemotePeerChannelMessage({
            data: JSON.stringify({
                kind: 'event',
                event: 'sync-event',
                payload: { type: 'snapshot-invalidated', reason: 'pairing-seq-drift', lastSeq: 3 },
            }),
            pendingRequests: pending,
            syncListeners: new Set([syncListener]),
            terminalListeners: new Set(),
            acceptEventSeq,
        })

        expect(acceptEventSeq).toHaveBeenCalledWith(3, true)
        expect(syncListener).toHaveBeenCalledWith({
            type: 'snapshot-invalidated',
            reason: 'pairing-seq-drift',
            lastSeq: 3,
        })
    })
})
