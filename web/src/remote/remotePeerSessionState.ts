import type { PairingTransportHandle, PairingTransportState, PairingTunnelRouteState } from '@viby/protocol/pairing'

export function readRemotePeerSessionSnapshot(
    fatalError: Error | null,
    routeState: PairingTunnelRouteState,
    transport: PairingTransportHandle
): PairingTransportState {
    if (fatalError) return { kind: 'fatal', reason: 'closed' }
    if (routeState.phase === 'ready') return { kind: 'ready' }
    const state = transport.getSnapshot()
    return state.kind === 'fatal' ? state : { kind: 'connecting', attempt: 0 }
}
