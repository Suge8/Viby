import type {
    PairingPeerTextSender,
    PairingTransportHandle,
    PairingTransportState,
    PairingTunnelRouteEvent,
    PairingTunnelRouteState,
} from '@viby/protocol/pairing'
import { createPairingTunnelRouteState, reducePairingTunnelRoute } from '@viby/protocol/pairing'
import { recordRemotePairingDiagnostic, recordRemotePairingRouteDiagnostic } from './remotePairingDiagnostics'
import type { RemoteDirectHeartbeat } from './remotePairingDirectHeartbeat'
import { createRemotePairingCodedError, mapByeToErrorKey, RemotePeerConnectError } from './remotePairingErrors'
import type { RemotePeerPendingRequests } from './remotePairingPendingRequests'
import type { RemoteRelayHeartbeat } from './remotePairingRelayHeartbeat'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'
import { reduceRouteAfterPeerRpcFailure } from './remotePeerRouteFailure'
import type { RemotePeerReadyGate } from './remotePeerSessionReady'
import { type RemotePeerSessionTrace, recordRemotePeerRouteTrace } from './remotePeerSessionTrace'

type RouteOwnerOptions = {
    cancelReadyTimeout: () => void
    closeListeners: Set<(error: Error) => void>
    emitSnapshot: () => void
    heartbeat: Pick<RemoteDirectHeartbeat, 'stop'>
    pendingRequests: Pick<RemotePeerPendingRequests, 'rejectAll'>
    readyGate: Pick<RemotePeerReadyGate, 'reject' | 'resolve'>
    relay: Pick<RemotePairingRelaySocket, 'dispose' | 'notifyForeground'>
    relayHeartbeat: Pick<RemoteRelayHeartbeat, 'stop'>
    requestIceRestart: () => void
    snapshotListeners: Set<() => void>
    trace: RemotePeerSessionTrace
    transport: Pick<PairingTransportHandle, 'dispose' | 'getSnapshot'>
    unsubscribeForeground: () => void
    unsubscribeTransport: () => void
}

type CloseResources = {
    channel: RTCDataChannel | null
    directTextSender: PairingPeerTextSender | null
}

export class RemotePeerSessionRouteOwner {
    private routeState: PairingTunnelRouteState = createPairingTunnelRouteState()
    private fatalError: Error | null = null

    constructor(private readonly options: RouteOwnerOptions) {}

    getRouteState(): PairingTunnelRouteState {
        return this.routeState
    }

    getFatalError(): Error | null {
        return this.fatalError
    }

    commit(event: PairingTunnelRouteEvent): void {
        const next = reducePairingTunnelRoute(this.routeState, event)
        if (next === this.routeState) return

        const reason = recordRemotePeerRouteTrace({
            event,
            next,
            previous: this.routeState,
            trace: this.options.trace,
        })
        recordRemotePairingRouteDiagnostic({
            phase: next.phase,
            route: next.activeRoute,
            event: event.type,
            reason,
        })
        this.routeState = next
        if (next.phase === 'ready') {
            this.options.cancelReadyTimeout()
            this.options.readyGate.resolve()
        }
        this.options.emitSnapshot()
    }

    handleRpcFailure(route: 'direct' | 'relay' | null): void {
        const failedRoute = route ?? this.routeState.activeRoute
        this.options.pendingRequests.rejectAll(createRemotePairingCodedError('remotePairing.error.peerRequestFailed'))
        this.routeState = reduceRouteAfterPeerRpcFailure(this.routeState, failedRoute)
        this.options.emitSnapshot()
        if (failedRoute === 'direct') this.options.requestIceRestart()
        this.options.relay.notifyForeground()
        recordRemotePairingDiagnostic('rpc-failure', { route: failedRoute ?? 'none' })
    }

    handleTransportState(): void {
        const error = readRemotePeerTransportFatalError(this.options.transport.getSnapshot(), this.fatalError)
        if (error) this.fail(error)
    }

    fail(error: Error): void {
        if (this.fatalError) return
        this.options.cancelReadyTimeout()
        this.fatalError = error
        this.options.readyGate.reject(error)
        this.options.pendingRequests.rejectAll(error)
        for (const listener of this.options.closeListeners) listener(error)
        this.options.emitSnapshot()
    }

    close(resources: CloseResources): void {
        const error = createRemotePairingCodedError('remotePairing.error.closedRetrying')
        this.options.cancelReadyTimeout()
        this.options.unsubscribeForeground()
        this.options.unsubscribeTransport()
        this.options.relay.dispose()
        this.options.relayHeartbeat.stop()
        resources.directTextSender?.close(error)
        this.options.heartbeat.stop()
        this.options.readyGate.reject(error)
        this.options.pendingRequests.rejectAll(error)
        this.options.closeListeners.clear()
        this.options.snapshotListeners.clear()
        resources.channel?.close()
        this.options.transport.dispose()
    }
}

export function readRemotePeerTransportFatalError(state: PairingTransportState, current: Error | null): Error | null {
    if (state.kind !== 'fatal' || current) return null
    if (state.reason === 'closed') return createRemotePairingCodedError('remotePairing.error.closedRetrying')
    if (state.reason === 'replaced') {
        return new RemotePeerConnectError('replaced', 'remotePairing.error.connectionReplaced')
    }
    return new RemotePeerConnectError('closed', mapByeToErrorKey(state.reason))
}
