import { PAIRING_PEER_REQUEST_TIMEOUT_MS, type PairingPeerRequest, type PairingPeerResponse } from '@viby/protocol'
import {
    measurePairingPeerTextMessage,
    type PairingPeerTextPriority,
    type PairingPeerTextSendReceipt,
} from '@viby/protocol/pairing'
import { createRemotePairingCodedError } from './remotePairingErrors'
import type { RemotePeerRpcTelemetrySample } from './remotePairingStats'
import { getRemotePeerRequestPriority } from './remotePeerRpcPolicy'
import { buildRemotePeerRpcTelemetrySample } from './remotePeerRpcTelemetry'

export const PEER_REQUEST_TIMEOUT_MS = PAIRING_PEER_REQUEST_TIMEOUT_MS

type PendingRequest = {
    method: PairingPeerRequest['method']
    route: RemotePeerRequestRoute
    startedAt: number
    timeoutId: number
    requestBytes: number
    requestChunks: number
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

export type RemotePeerRequestRoute = 'direct' | 'relay'

function toError(error: unknown): Error {
    return error instanceof Error ? error : createRemotePairingCodedError('remotePairing.error.peerRequestFailed')
}

type PendingRequestOptions = {
    onTransportFailure?: (error: Error, route: RemotePeerRequestRoute | null) => void
    onTelemetry?: (sample: RemotePeerRpcTelemetrySample) => void
}

export interface RemotePeerMessageSender {
    readonly readyState: string
    readonly route: RemotePeerRequestRoute
    sendText(data: string, priority: PairingPeerTextPriority): Promise<PairingPeerTextSendReceipt>
}

export function createRemotePeerPendingRequests(options: PendingRequestOptions = {}) {
    const pending = new Map<string, PendingRequest>()

    function deletePending(id: string): PendingRequest | null {
        const request = pending.get(id) ?? null
        if (request) {
            pending.delete(id)
            window.clearTimeout(request.timeoutId)
        }
        return request
    }

    function rejectAll(error: Error): void {
        for (const request of pending.values()) {
            window.clearTimeout(request.timeoutId)
            request.reject(error)
            emitTelemetry(request, { ok: false, timedOut: false, response: null })
        }
        pending.clear()
    }

    function emitTelemetry(
        request: PendingRequest,
        outcome: { ok: boolean; timedOut: boolean; response: PairingPeerTextSendReceipt | null }
    ): void {
        options.onTelemetry?.(buildRemotePeerRpcTelemetrySample(request, outcome))
    }

    function requestPeer<T>(
        sender: RemotePeerMessageSender | null,
        request: PairingPeerRequest,
        parse: (value: unknown) => T
    ): Promise<T> {
        if (!sender || sender.readyState !== 'open') {
            const error = createRemotePairingCodedError('remotePairing.error.peerRequestFailed')
            options.onTransportFailure?.(error, null)
            return Promise.reject(error)
        }

        const payload = JSON.stringify(request)
        const requestStats = measurePairingPeerTextMessage(payload)
        return new Promise<T>((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
                const expired = deletePending(request.id)
                const error = createRemotePairingCodedError('remotePairing.error.peerRequestFailed')
                reject(error)
                if (expired) emitTelemetry(expired, { ok: false, timedOut: true, response: null })
                options.onTransportFailure?.(error, expired?.route ?? null)
            }, PEER_REQUEST_TIMEOUT_MS)
            const pendingRequest: PendingRequest = {
                method: request.method,
                route: sender.route,
                startedAt: Date.now(),
                timeoutId,
                requestBytes: requestStats.bytes,
                requestChunks: requestStats.chunks,
                resolve: (value) => resolve(parse(value)),
                reject,
            }
            pending.set(request.id, pendingRequest)
            const handleSendFailure = (error: unknown): void => {
                const failed = deletePending(request.id)
                if (!failed) return
                const normalized = toError(error)
                reject(normalized)
                emitTelemetry(failed, { ok: false, timedOut: false, response: null })
                options.onTransportFailure?.(normalized, failed.route)
            }
            try {
                void sender.sendText(payload, getRemotePeerRequestPriority(request.method)).then((receipt) => {
                    pendingRequest.requestBytes = receipt.bytes
                    pendingRequest.requestChunks = receipt.chunks
                }, handleSendFailure)
            } catch (error) {
                handleSendFailure(error)
            }
        })
    }

    function resolveResponse(response: PairingPeerResponse): void {
        const request = deletePending(response.id)
        if (!request) return
        const responseStats = measurePairingPeerTextMessage(JSON.stringify(response))
        if (response.ok) {
            try {
                request.resolve(response.result)
                emitTelemetry(request, { ok: true, timedOut: false, response: responseStats })
            } catch (error) {
                request.reject(toError(error))
                emitTelemetry(request, { ok: false, timedOut: false, response: responseStats })
            }
            return
        }
        request.reject(new Error(response.error.message))
        emitTelemetry(request, { ok: false, timedOut: false, response: responseStats })
    }

    return {
        rejectAll,
        request: requestPeer,
        resolveResponse,
    }
}

export type RemotePeerPendingRequests = ReturnType<typeof createRemotePeerPendingRequests>
