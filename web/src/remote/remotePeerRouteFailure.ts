import type { PairingTunnelRoute, PairingTunnelRouteState } from '@viby/protocol/pairing'
import { reducePairingTunnelRoute } from '@viby/protocol/pairing'

export function reduceRouteAfterPeerRpcFailure(
    state: PairingTunnelRouteState,
    failedRoute: PairingTunnelRoute | null
): PairingTunnelRouteState {
    if (failedRoute === 'relay') return reducePairingTunnelRoute(state, { type: 'relay-lost' })
    if (failedRoute === 'direct')
        return reducePairingTunnelRoute(state, { type: 'direct-failed', reason: 'rpc-failed' })
    return state
}
