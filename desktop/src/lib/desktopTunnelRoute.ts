import type { PairingTransportState, PairingTunnelRouteEvent, PairingTunnelRouteState } from '@viby/protocol/pairing'
import {
    PAIRING_LINK_SAMPLE_STALE_MS,
    readPairingTunnelTelemetry,
    resolvePairingTunnelDirectCandidateType,
} from '@viby/protocol/pairing'
import type { DesktopPairingSession, PairingBridgeState, PairingBridgeStats } from '@/types'

function freshTelemetryRoundTrip(telemetry: ReturnType<typeof readPairingTunnelTelemetry>): number | null {
    return telemetry.roundTripSampledAt ? telemetry.roundTripTimeMs : null
}

export function buildDesktopTunnelBridgeState(options: {
    base: DesktopPairingSession
    directState: PairingTransportState | null
    routeState: PairingTunnelRouteState
    stats: PairingBridgeStats | null
}): PairingBridgeState {
    const { base, directState, routeState, stats } = options
    // `phase: 'ready'` must imply the guest has actually attached and
    // exchanged at least one heartbeat ack (`roundTripTimeMs` populated).
    // `routeState.phase === 'ready'` alone fires on `relay-ready`, which
    // is just the host tunnel WS onopen — broker accepts the host long
    // before any guest joins. Treating that as paired produced phantom
    // "connected" UI before anyone scanned.
    if (routeState.phase === 'ready' && routeState.roundTripTimeMs !== null) {
        return { phase: 'ready', message: '已连接', pairing: base.pairing, stats }
    }
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
    if (telemetry.activeTransport === 'relay-wss') {
        return {
            transport: 'relay',
            transportMode: 'relay-wss',
            previousTransport: null,
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: freshTelemetryRoundTrip(telemetry),
            sampledAt: telemetry.roundTripSampledAt ?? Date.now(),
            staleAfterMs: PAIRING_LINK_SAMPLE_STALE_MS,
            routeRevision: telemetry.routeRevision,
            directBlockedReason: telemetry.directBlockedReason,
            restartCount: telemetry.directProbeFailures,
        }
    }
    if (telemetry.activeRoute === 'direct') {
        const transport = 'direct'
        return directStats && directStats.transport === transport
            ? {
                  ...directStats,
                  transportMode: telemetry.activeTransport ?? directStats.transportMode,
                  routeRevision: telemetry.routeRevision,
                  directBlockedReason: telemetry.directBlockedReason,
                  restartCount: telemetry.directProbeFailures,
              }
            : {
                  transport,
                  transportMode: telemetry.activeTransport ?? 'unknown',
                  previousTransport: null,
                  localCandidateType: telemetry.directCandidateType,
                  remoteCandidateType: null,
                  currentRoundTripTimeMs: freshTelemetryRoundTrip(telemetry),
                  sampledAt: telemetry.roundTripSampledAt ?? Date.now(),
                  staleAfterMs: PAIRING_LINK_SAMPLE_STALE_MS,
                  routeRevision: telemetry.routeRevision,
                  directBlockedReason: telemetry.directBlockedReason,
                  restartCount: telemetry.directProbeFailures,
              }
    }
    return directStats
}

export function readDesktopTunnelDirectCandidateEvent(stats: PairingBridgeStats): PairingTunnelRouteEvent | null {
    const candidateType = resolvePairingTunnelDirectCandidateType(stats)
    return candidateType
        ? {
              type: 'direct-candidate-selected',
              candidateType,
              roundTripTimeMs: stats.currentRoundTripTimeMs,
              sampledAt: stats.sampledAt,
          }
        : null
}
