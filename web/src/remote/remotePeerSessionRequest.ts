import type { PairingPeerRequest } from '@viby/protocol'
import type { PairingPeerTextSender, PairingTunnelRouteState } from '@viby/protocol/pairing'
import { recordRemotePairingDiagnostic } from './remotePairingDiagnostics'
import type { RemotePeerMessageSender } from './remotePairingPendingRequests'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'
import { createRemotePeerSessionSender } from './remotePeerSessionSender'

type PendingRequests = {
    request<T>(
        sender: RemotePeerMessageSender | null,
        request: PairingPeerRequest,
        parse: (value: unknown) => T
    ): Promise<T>
}

const RELAY_RETRY_METHODS = new Set<PairingPeerRequest['method']>([
    'session.abort',
    'session.archive',
    'session.close',
    'session.unarchive',
])

export function shouldRetryRemotePeerRequestViaRelay(method: PairingPeerRequest['method']): boolean {
    return RELAY_RETRY_METHODS.has(method)
}

function clonePeerRequest(request: PairingPeerRequest): PairingPeerRequest {
    return { ...request, id: globalThis.crypto?.randomUUID?.() ?? `peer-rpc-${Date.now()}-${Math.random()}` }
}

function createSender(options: RequestRouteOptions, route?: 'direct' | 'relay') {
    return createRemotePeerSessionSender({ ...options, route })
}

function requestViaRoute<T>(options: RequestRouteOptions, request: PairingPeerRequest, parse: (value: unknown) => T) {
    return options.pendingRequests.request(createSender(options, options.route), request, parse)
}

export type RequestRouteOptions = {
    pendingRequests: PendingRequests
    routeState: PairingTunnelRouteState
    directChannelReady: boolean
    channel: RTCDataChannel | null
    directTextSender: PairingPeerTextSender | null
    relay: RemotePairingRelaySocket
    getFatalError: () => Error | null
    route?: 'direct' | 'relay'
}

export async function requestRemotePeer<T>(
    options: RequestRouteOptions,
    request: PairingPeerRequest,
    parse: (value: unknown) => T
): Promise<T> {
    if (!shouldRetryRemotePeerRequestViaRelay(request.method) || options.routeState.activeRoute !== 'direct') {
        return await requestViaRoute(options, request, parse)
    }
    try {
        return await requestViaRoute({ ...options, route: 'direct' }, clonePeerRequest(request), parse)
    } catch (error) {
        if (options.getFatalError() || options.relay.readyState !== 'open') throw error
        recordRemotePairingDiagnostic('rpc-relay-retry', { method: request.method })
        return await requestViaRoute({ ...options, route: 'relay' }, clonePeerRequest(request), parse)
    }
}
