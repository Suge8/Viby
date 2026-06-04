import type { PairingTransportState, PairingTunnelRouteEvent, PairingTunnelRouteState } from '@viby/protocol/pairing'
import { reducePairingTunnelRoute } from '@viby/protocol/pairing'
import { recordRemotePairingRouteDiagnostic } from './remotePairingDiagnostics'
import { createRemotePairingCodedError, mapByeToErrorKey, RemotePeerConnectError } from './remotePairingErrors'
import { type RemotePeerSessionTrace, recordRemotePeerRouteTrace } from './remotePeerSessionTrace'

export type RouteCommitResult = {
    next: PairingTunnelRouteState
    changed: boolean
}

export function commitRemotePeerSessionRoute(options: {
    event: PairingTunnelRouteEvent
    routeState: PairingTunnelRouteState
    trace: RemotePeerSessionTrace
}): RouteCommitResult {
    const next = reducePairingTunnelRoute(options.routeState, options.event)
    if (next === options.routeState) return { next, changed: false }

    const reason = recordRemotePeerRouteTrace({
        event: options.event,
        next,
        previous: options.routeState,
        trace: options.trace,
    })
    recordRemotePairingRouteDiagnostic({
        phase: next.phase,
        route: next.activeRoute,
        event: options.event.type,
        reason,
    })
    return { next, changed: true }
}

export function readRemotePeerTransportFatalError(state: PairingTransportState, current: Error | null): Error | null {
    if (state.kind !== 'fatal' || current) return null
    if (state.reason === 'closed') return createRemotePairingCodedError('remotePairing.error.closedRetrying')
    if (state.reason === 'replaced') {
        return new RemotePeerConnectError('replaced', 'remotePairing.error.connectionReplaced')
    }
    return new RemotePeerConnectError('closed', mapByeToErrorKey(state.reason))
}
