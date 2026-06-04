import type { PairingTransportState, PairingTunnelRouteState } from '@viby/protocol/pairing'
import type { DesktopPairingSession, PairingBridgeState, PairingBridgeStats } from '@/types'
import { buildDesktopTunnelBridgeState, readDesktopTunnelRouteStats } from './desktopTunnelRoute'

export function emitPairingBridgeState(options: {
    directState: PairingTransportState | null
    disposed: boolean
    fatalMessage: string | null
    latestStats: PairingBridgeStats | null
    onStateChange: (state: PairingBridgeState) => void
    pairing: DesktopPairingSession
    routeState: PairingTunnelRouteState
    telemetryWarning: string | null
}): void {
    if (options.disposed) return
    if (options.fatalMessage) {
        options.onStateChange({
            phase: 'fatal',
            message: options.fatalMessage,
            pairing: options.pairing.pairing,
            stats: null,
        })
        return
    }
    const state = buildDesktopTunnelBridgeState({
        base: options.pairing,
        directState: options.directState,
        routeState: options.routeState,
        stats: readDesktopTunnelRouteStats(options.routeState, options.latestStats),
    })
    options.onStateChange(
        options.telemetryWarning && state.phase === 'ready' ? { ...state, message: options.telemetryWarning } : state
    )
}
