import type { PairingTunnelRouteEvent } from '@viby/protocol/pairing'
import type { PairingBridgeStats } from '@/types'
import type { LocalHubPairingClient } from './localHubPairingClient'
import { attachPairingDataChannel, type PairingPeerTextSink } from './pairingBridgeControllerSupport'

export const DIRECT_PROBE_TIMEOUT_MS = 12_000

export function attachPairingBridgeDataChannel(options: {
    channel: RTCDataChannel
    commitDirectCandidateFromStats: (stats: PairingBridgeStats) => void
    commitRoute: (event: PairingTunnelRouteEvent) => void
    emitBridgeState: () => void
    getClient: () => LocalHubPairingClient
    getLatestStats: () => PairingBridgeStats | null
    getRouteGeneration: () => number
    isCurrentChannel: () => boolean
    isDisposed: () => boolean
    maybeReprobeDirect: (force?: boolean) => void
    replayEventsAfter: (seq: number, sink: PairingPeerTextSink) => void
    reportAsyncError: (message: string, error: unknown) => void
    reportDirectProbeError: (error: unknown) => void
    sampleDirectStats: () => Promise<void>
    startEventStream: (sink: PairingPeerTextSink) => void
    stopEventStream: () => void
}): void {
    const routeGeneration = options.getRouteGeneration()
    const timeoutId = setTimeout(() => {
        if (!options.isCurrentChannel() || options.isDisposed()) return
        options.commitRoute({ type: 'direct-failed', reason: 'timeout', routeGeneration })
        options.emitBridgeState()
    }, DIRECT_PROBE_TIMEOUT_MS)
    timeoutId.unref?.()
    const clearProbeTimeout = () => clearTimeout(timeoutId)

    attachPairingDataChannel({
        channel: options.channel,
        getClient: options.getClient,
        isDisposed: options.isDisposed,
        onChannelOpen: () => {
            if (options.isCurrentChannel()) options.emitBridgeState()
        },
        onChannelActive: () => {
            clearProbeTimeout()
            handleActiveChannel(options)
        },
        onChannelClosed: () => {
            clearProbeTimeout()
            if (!options.isCurrentChannel()) return
            options.commitRoute({
                type: 'direct-failed',
                reason: 'closed',
                routeGeneration: options.getRouteGeneration(),
            })
            options.maybeReprobeDirect(true)
            options.emitBridgeState()
        },
        onHeartbeat: (heartbeat, sink) => {
            if (typeof heartbeat.lastSeenSeq === 'number') options.replayEventsAfter(heartbeat.lastSeenSeq, sink)
        },
        startEventStream: async (sink) => options.startEventStream(sink),
        stopEventStream: options.stopEventStream,
        reportAsyncError: options.reportAsyncError,
    })
}

function handleActiveChannel(options: Parameters<typeof attachPairingBridgeDataChannel>[0]): void {
    if (!options.isCurrentChannel()) return
    const latestStats = options.getLatestStats()
    options.commitRoute({
        type: 'heartbeat-ack',
        route: 'direct',
        routeGeneration: options.getRouteGeneration(),
        roundTripTimeMs: latestStats?.currentRoundTripTimeMs,
        sampledAt: latestStats?.sampledAt,
    })
    if (latestStats) options.commitDirectCandidateFromStats(latestStats)
    void options.sampleDirectStats().catch(options.reportDirectProbeError)
    options.emitBridgeState()
}
