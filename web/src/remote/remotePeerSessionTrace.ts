import {
    createSessionTraceRecorder,
    type PairingTunnelRouteEvent,
    type PairingTunnelRouteState,
} from '@viby/protocol/pairing'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import { recordRemotePairingDiagnostic } from './remotePairingDiagnostics'

declare global {
    interface Window {
        __vibyExportSessionTrace?: () => string
    }
}

export type RemotePeerSessionTrace = ReturnType<typeof createSessionTraceRecorder>

export function createRemotePeerSessionTrace(pairingId: string): RemotePeerSessionTrace {
    return createSessionTraceRecorder({ pairingId, peerRole: 'phone' })
}

export function installRemotePeerSessionTraceExporter(trace: RemotePeerSessionTrace): void {
    if (typeof window === 'undefined') return
    window.__vibyExportSessionTrace = () => JSON.stringify(trace.export(), null, 2)
}

export function recordRemotePeerRouteTrace(options: {
    event: PairingTunnelRouteEvent
    next: PairingTunnelRouteState
    previous: PairingTunnelRouteState
    trace: RemotePeerSessionTrace
}): string | null {
    const reason = readRouteEventReason(options.event) ?? options.next.directBlockedReason
    options.trace.emit({
        event: 'route.transition',
        routeTransition: {
            fromPhase: options.previous.phase,
            fromRoute: options.previous.activeRoute,
            toPhase: options.next.phase,
            toRoute: options.next.activeRoute,
            reason: reason ?? null,
            routeRevision: options.next.routeRevision,
        },
        payloadMeta: {
            reducerEvent: options.event.type,
            directBlockedReason: options.next.directBlockedReason,
            routeGeneration: options.next.routeGeneration,
        },
    })
    return reason
}

export function recordRemoteDirectCandidateSampleFailure(options: {
    error: unknown
    routeState: PairingTunnelRouteState
    trace: RemotePeerSessionTrace
}): void {
    reportWebRuntimeError('Remote direct candidate stats sample failed.', options.error)
    recordRemotePairingDiagnostic('direct-candidate-sample-failed', {
        route: options.routeState.activeRoute ?? 'none',
        routeGeneration: options.routeState.routeGeneration,
    })
    options.trace.emit({
        event: 'getstats.opaque',
        payloadMeta: {
            route: options.routeState.activeRoute ?? 'none',
            routeGeneration: options.routeState.routeGeneration,
            message: options.error instanceof Error ? options.error.message : 'unknown',
        },
    })
}

function readRouteEventReason(event: PairingTunnelRouteEvent): string | null {
    if (event.type === 'direct-failed') return event.reason ?? null
    if (event.type === 'heartbeat-missed') return 'heartbeat-missed'
    if (event.type === 'relay-lost') return 'relay-lost'
    return null
}
