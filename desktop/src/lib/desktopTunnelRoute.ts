import type { PairingTransportState, PairingTunnelRouteEvent, PairingTunnelRouteState } from '@viby/protocol/pairing'
import { readPairingTunnelTelemetry, resolvePairingTunnelDirectCandidateType } from '@viby/protocol/pairing'
import type { DesktopPairingSession, PairingBridgeState, PairingBridgeStats } from '@/types'

export function buildDesktopTunnelBridgeState(options: {
    base: DesktopPairingSession
    directState: PairingTransportState | null
    routeState: PairingTunnelRouteState
    stats: PairingBridgeStats | null
}): PairingBridgeState {
    const { base, directState, routeState, stats } = options
    if (routeState.phase === 'ready') return { phase: 'ready', message: '已连接', pairing: base.pairing, stats }
    if (routeState.phase === 'fatal') {
        return { phase: 'fatal', message: routeState.fatalReason ?? '连接失败', pairing: base.pairing, stats: null }
    }
    if (!directState || directState.kind === 'fatal') {
        return { phase: 'connecting', message: '正在连接中转', pairing: base.pairing, stats }
    }
    return {
        phase: 'connecting',
        message:
            directState.kind === 'ready'
                ? '正在建立数据通道'
                : directState.attempt > 0
                  ? `正在握手（${directState.attempt}）`
                  : '正在握手',
        pairing: base.pairing,
        stats,
    }
}

export function readDesktopTunnelRouteStats(
    routeState: PairingTunnelRouteState,
    directStats: PairingBridgeStats | null
): PairingBridgeStats | null {
    const telemetry = readPairingTunnelTelemetry(routeState)
    if (telemetry.activeRoute === 'relay') {
        return {
            transport: 'relay',
            previousTransport: null,
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: telemetry.roundTripTimeMs,
            restartCount: telemetry.directProbeFailures,
        }
    }
    if (telemetry.activeRoute === 'direct') {
        return directStats && directStats.transport === 'direct'
            ? { ...directStats, restartCount: telemetry.directProbeFailures }
            : {
                  transport: 'direct',
                  previousTransport: null,
                  localCandidateType: telemetry.directCandidateType,
                  remoteCandidateType: null,
                  currentRoundTripTimeMs: telemetry.roundTripTimeMs,
                  restartCount: telemetry.directProbeFailures,
              }
    }
    return directStats
}

export function readDesktopTunnelDirectCandidateEvent(stats: PairingBridgeStats): PairingTunnelRouteEvent | null {
    const candidateType = resolvePairingTunnelDirectCandidateType(stats)
    return candidateType
        ? { type: 'direct-candidate-selected', candidateType, roundTripTimeMs: stats.currentRoundTripTimeMs }
        : null
}
