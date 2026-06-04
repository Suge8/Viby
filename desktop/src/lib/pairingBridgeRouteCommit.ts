import type { PairingTunnelRouteEvent, PairingTunnelRouteState, SessionTraceRecorder } from '@viby/protocol/pairing'
import { reducePairingTunnelRoute } from '@viby/protocol/pairing'

export function commitPairingBridgeRoute(options: {
    event: PairingTunnelRouteEvent
    routeState: PairingTunnelRouteState
    trace: SessionTraceRecorder
}): PairingTunnelRouteState {
    const next = reducePairingTunnelRoute(options.routeState, options.event)
    if (next === options.routeState) return next

    const reason = readRouteEventReason(options.event) ?? next.directBlockedReason
    options.trace.emit({
        event: 'route.transition',
        routeTransition: {
            fromPhase: options.routeState.phase,
            fromRoute: options.routeState.activeRoute,
            toPhase: next.phase,
            toRoute: next.activeRoute,
            reason: reason ?? null,
            routeRevision: next.routeRevision,
        },
        payloadMeta: {
            reducerEvent: options.event.type,
            directBlockedReason: next.directBlockedReason,
            routeGeneration: next.routeGeneration,
        },
    })
    return next
}

function readRouteEventReason(event: PairingTunnelRouteEvent): string | null {
    if (event.type === 'direct-failed') return event.reason ?? null
    if (event.type === 'heartbeat-missed') return 'heartbeat-missed'
    if (event.type === 'relay-lost') return 'relay-lost'
    return null
}
