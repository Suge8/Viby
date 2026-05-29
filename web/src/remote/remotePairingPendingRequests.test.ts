import type { PairingPeerRequest } from '@viby/protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    createRemotePeerPendingRequests,
    PEER_REQUEST_TIMEOUT_MS,
    type RemotePeerMessageSender,
} from './remotePairingPendingRequests'

function sender(): RemotePeerMessageSender {
    return {
        readyState: 'open',
        route: 'direct',
        sendText: vi.fn(async (data: string) => ({ bytes: data.length, chunks: 1 })),
    }
}

function listRequest(): PairingPeerRequest {
    return { kind: 'request', id: 'r1', method: 'sessions.list', params: {} }
}

describe('remotePairingPendingRequests', () => {
    afterEach(() => {
        vi.useRealTimers()
    })
    it('keeps request telemetry and failure route when a queued send times out', async () => {
        vi.useFakeTimers()
        const onTelemetry = vi.fn()
        const onTransportFailure = vi.fn()
        const pending = createRemotePeerPendingRequests({ onTelemetry, onTransportFailure })
        const request = listRequest()
        const delayedSender: RemotePeerMessageSender = {
            readyState: 'open',
            route: 'direct',
            sendText: vi.fn(() => new Promise<never>(() => undefined)),
        }

        const result = pending.request(delayedSender, request, (value) => value)
        const rejection = expect(result).rejects.toThrow()
        await vi.advanceTimersByTimeAsync(PEER_REQUEST_TIMEOUT_MS)

        await rejection
        expect(onTelemetry).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'sessions.list',
                timedOut: true,
                requestBytes: expect.any(Number),
                requestChunks: 1,
            })
        )
        expect(onTransportFailure).toHaveBeenCalledWith(expect.any(Error), 'direct')
    })

    it('records RPC telemetry when a response resolves', async () => {
        const onTelemetry = vi.fn()
        const pending = createRemotePeerPendingRequests({ onTelemetry })
        const request = listRequest()
        const result = pending.request(sender(), request, (value) => value)

        await Promise.resolve()
        pending.resolveResponse({ kind: 'response', id: request.id, ok: true, result: { sessions: [] } })

        await expect(result).resolves.toEqual({ sessions: [] })
        expect(onTelemetry).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'sessions.list',
                route: 'direct',
                ok: true,
                timedOut: false,
                requestChunks: 1,
                responseChunks: 1,
            })
        )
    })
})
