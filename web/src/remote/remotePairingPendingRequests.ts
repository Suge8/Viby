import { PAIRING_PEER_REQUEST_TIMEOUT_MS, type PairingPeerRequest, type PairingPeerResponse } from '@viby/protocol'
import { createRemotePairingCodedError } from './remotePairingErrors'

export const PEER_REQUEST_TIMEOUT_MS = PAIRING_PEER_REQUEST_TIMEOUT_MS

type PendingRequest = {
    timeoutId: number
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

function toError(error: unknown): Error {
    return error instanceof Error ? error : createRemotePairingCodedError('remotePairing.error.peerRequestFailed')
}

type PendingRequestOptions = {
    onTransportFailure?: (error: Error) => void
}

export function createRemotePeerPendingRequests(options: PendingRequestOptions = {}): {
    rejectAll: (error: Error) => void
    request: <T>(
        channel: RTCDataChannel | null,
        request: PairingPeerRequest,
        parse: (value: unknown) => T
    ) => Promise<T>
    resolveResponse: (response: PairingPeerResponse) => void
} {
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
        }
        pending.clear()
    }

    function requestPeer<T>(
        channel: RTCDataChannel | null,
        request: PairingPeerRequest,
        parse: (value: unknown) => T
    ): Promise<T> {
        if (!channel || channel.readyState !== 'open') {
            const error = createRemotePairingCodedError('remotePairing.error.peerRequestFailed')
            options.onTransportFailure?.(error)
            return Promise.reject(error)
        }

        return new Promise<T>((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
                pending.delete(request.id)
                const error = createRemotePairingCodedError('remotePairing.error.peerRequestFailed')
                reject(error)
                options.onTransportFailure?.(error)
            }, PEER_REQUEST_TIMEOUT_MS)

            pending.set(request.id, {
                timeoutId,
                resolve: (value) => {
                    try {
                        resolve(parse(value))
                    } catch (error) {
                        reject(toError(error))
                    }
                },
                reject,
            })
            try {
                channel.send(JSON.stringify(request))
            } catch (error) {
                deletePending(request.id)
                const normalized = toError(error)
                reject(normalized)
                options.onTransportFailure?.(normalized)
            }
        })
    }

    function resolveResponse(response: PairingPeerResponse): void {
        const request = deletePending(response.id)
        if (!request) {
            return
        }
        if (response.ok) {
            request.resolve(response.result)
            return
        }
        request.reject(new Error(response.error.message))
    }

    return {
        rejectAll,
        request: requestPeer,
        resolveResponse,
    }
}

export type RemotePeerPendingRequests = ReturnType<typeof createRemotePeerPendingRequests>
