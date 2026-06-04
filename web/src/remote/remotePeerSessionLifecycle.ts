import type { PairingPeerTextSender, PairingTransportHandle, PairingTunnelRouteState } from '@viby/protocol/pairing'
import { recordRemotePairingDiagnostic } from './remotePairingDiagnostics'
import type { RemoteDirectHeartbeat } from './remotePairingDirectHeartbeat'
import { createRemotePairingCodedError } from './remotePairingErrors'
import type { RemotePeerPendingRequests } from './remotePairingPendingRequests'
import type { RemoteRelayHeartbeat } from './remotePairingRelayHeartbeat'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'
import { reduceRouteAfterPeerRpcFailure } from './remotePeerRouteFailure'
import type { RemotePeerReadyGate } from './remotePeerSessionReady'

export function handleRemotePeerTransportFailure(options: {
    route: 'direct' | 'relay' | null
    routeState: PairingTunnelRouteState
    emitSnapshot: () => void
    pendingRequests: Pick<RemotePeerPendingRequests, 'rejectAll'>
    relay: Pick<RemotePairingRelaySocket, 'notifyForeground'>
    requestIceRestart: () => void
}): PairingTunnelRouteState {
    const failedRoute = options.route ?? options.routeState.activeRoute
    const error = createRemotePairingCodedError('remotePairing.error.peerRequestFailed')
    options.pendingRequests.rejectAll(error)
    const nextRouteState = reduceRouteAfterPeerRpcFailure(options.routeState, failedRoute)
    options.emitSnapshot()
    if (failedRoute === 'direct') options.requestIceRestart()
    options.relay.notifyForeground()
    recordRemotePairingDiagnostic('rpc-failure', { route: failedRoute ?? 'none' })
    return nextRouteState
}

export function closeRemotePeerSessionResources(options: {
    cancelReadyTimeout: () => void
    unsubscribeForeground: () => void
    unsubscribeTransport: () => void
    relay: Pick<RemotePairingRelaySocket, 'dispose'>
    relayHeartbeat: Pick<RemoteRelayHeartbeat, 'stop'>
    directTextSender: PairingPeerTextSender | null
    heartbeat: Pick<RemoteDirectHeartbeat, 'stop'>
    readyGate: Pick<RemotePeerReadyGate, 'reject'>
    pendingRequests: Pick<RemotePeerPendingRequests, 'rejectAll'>
    closeListeners: Set<(error: Error) => void>
    snapshotListeners: Set<() => void>
    channel: RTCDataChannel | null
    transport: Pick<PairingTransportHandle, 'dispose'>
}): void {
    const error = createRemotePairingCodedError('remotePairing.error.closedRetrying')
    options.cancelReadyTimeout()
    options.unsubscribeForeground()
    options.unsubscribeTransport()
    options.relay.dispose()
    options.relayHeartbeat.stop()
    options.directTextSender?.close(error)
    options.heartbeat.stop()
    options.readyGate.reject(error)
    options.pendingRequests.rejectAll(error)
    options.closeListeners.clear()
    options.snapshotListeners.clear()
    options.channel?.close()
    options.transport.dispose()
}
