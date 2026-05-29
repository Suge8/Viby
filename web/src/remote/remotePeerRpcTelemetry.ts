import type { PairingPeerRequest } from '@viby/protocol'
import type { PairingPeerTextSendReceipt } from '@viby/protocol/pairing'
import type { RemotePeerRequestRoute } from './remotePairingPendingRequests'
import type { RemotePeerRpcTelemetrySample } from './remotePairingStats'

export type RemotePeerTelemetryRequest = {
    method: PairingPeerRequest['method']
    route: RemotePeerRequestRoute
    startedAt: number
    requestBytes: number
    requestChunks: number
}

export function buildRemotePeerRpcTelemetrySample(
    request: RemotePeerTelemetryRequest,
    outcome: { ok: boolean; timedOut: boolean; response: PairingPeerTextSendReceipt | null },
    now = Date.now
): RemotePeerRpcTelemetrySample {
    const sampledAt = now()
    return {
        method: request.method,
        route: request.route,
        durationMs: sampledAt - request.startedAt,
        ok: outcome.ok,
        timedOut: outcome.timedOut,
        requestBytes: request.requestBytes,
        requestChunks: request.requestChunks,
        responseBytes: outcome.response?.bytes ?? null,
        responseChunks: outcome.response?.chunks ?? null,
        sampledAt,
    }
}
