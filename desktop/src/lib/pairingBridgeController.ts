import {
    createPairingTransport,
    createPairingTunnelRouteState,
    createSessionTraceRecorder,
    PAIRING_STATS_POLL_INTERVAL_MS,
    type PairingTransportHandle,
    type PairingTransportState,
    type PairingTunnelRouteEvent,
    type PairingTunnelRouteState,
} from '@viby/protocol/pairing'
import type {
    DesktopPairingSession,
    HubRuntimeStatus,
    PairingBridgeState,
    PairingBridgeStats,
    PairingIceServer,
} from '@/types'
import { reprobeDesktopDirect } from './desktopDirectReprobe'
import { readDesktopTunnelDirectCandidateEvent, readDesktopTunnelRouteStats } from './desktopTunnelRoute'
import { createDeferredHubClient } from './localHubPairingDeferredClient'
import { HubPausedError, isHubPausedError } from './pairingBridgeControllerSupport'
import { attachPairingBridgeDataChannel } from './pairingBridgeDataChannel'
import { commitPairingBridgeRoute } from './pairingBridgeRouteCommit'
import { emitPairingBridgeState } from './pairingBridgeStateEmitter'
import { startPairingBridgeStats } from './pairingBridgeStats'
import { startPairingBridgeTelemetry } from './pairingBridgeTelemetry'
import { createPairingEventBroadcaster } from './pairingEventBroadcaster'
import { startPairingRelayBridge } from './pairingRelayBridge'

declare global {
    interface Window {
        __vibyExportHostSessionTrace?: () => string
    }
}

function toIceServers(servers: PairingIceServer[]): RTCIceServer[] {
    return servers.map((server) => ({ urls: server.urls, username: server.username, credential: server.credential }))
}

export function startPairingBridge(options: {
    pairing: DesktopPairingSession
    getStatus: () => HubRuntimeStatus | null
    onStateChange: (state: PairingBridgeState) => void
    /**
     * The broker permanently rejected this pairing's host credential. The owner
     * must drop the stored pairing so a stale token cannot churn the broker
     * origin and starve a freshly scanned pairing.
     */
    onRejected?: (reason: string) => void
}): () => void {
    if (typeof WebSocket === 'undefined') {
        options.onStateChange({
            phase: 'fatal',
            message: '当前环境不支持远程中转。',
            pairing: options.pairing.pairing,
            stats: null,
        })
        return () => {}
    }

    let disposed = false
    let rejected = false
    let channel: RTCDataChannel | null = null
    let latestStats: PairingBridgeStats | null = null
    let fatalMessage: string | null = null
    let telemetryWarning: string | null = null
    let routeState = createPairingTunnelRouteState()
    let directState: PairingTransportState | null = null
    const trace = createSessionTraceRecorder({ pairingId: options.pairing.pairing.id, peerRole: 'desktop' })
    const client = createDeferredHubClient(options.getStatus)
    const eventBroadcaster = createPairingEventBroadcaster({
        getClient: () => client,
        reportError: reportEventReplayError,
    })
    let transport: PairingTransportHandle | null = null
    let relay: ReturnType<typeof startPairingRelayBridge> | null = null
    let unsubscribeTransport = () => {}
    let disposeDirectEventSink: (() => void) | null = null
    const directSupported = typeof RTCPeerConnection !== 'undefined'
    installTraceExporter()
    if (directSupported) startDirectTransport()
    relay = startPairingRelayBridge({
        tunnelUrl: options.pairing.tunnelUrl,
        getClient: () => client,
        isDisposed: () => disposed,
        onOpen: () => {
            commitRoute({ type: 'relay-ready', transport: 'relay-wss' })
            maybeReprobeDirect()
        },
        onActive: (sample) => {
            commitRoute({
                type: 'heartbeat-ack',
                route: 'relay',
                roundTripTimeMs: sample?.roundTripTimeMs,
                sampledAt: sample?.sampledAt,
            })
            maybeReprobeDirect()
        },
        onClosed: () => commitRoute({ type: 'relay-lost' }),
        onFatal: handleRejected,
        onPeerReplaced: rebuildDirectTransport,
        events: eventBroadcaster,
        reportAsyncError,
    })
    const stats = transport
        ? startPairingBridgeStats({
              getPeer: () => {
                  if (!transport) throw new Error('pairing transport is not ready')
                  return transport.getPeer() as unknown as RTCPeerConnection
              },
              setStats: (nextStats) => {
                  latestStats = nextStats
              },
              reportError: reportDirectStatsError,
          })
        : null
    const statsSampleTimer = stats
        ? setInterval(() => void sampleDirectStats().catch(reportDirectProbeError), PAIRING_STATS_POLL_INTERVAL_MS)
        : null
    const telemetry = startPairingBridgeTelemetry({
        pairing: options.pairing,
        getStats: () => readDesktopTunnelRouteStats(routeState, latestStats),
        reportError: reportTelemetryError,
    })
    void sampleDirectStats().catch(reportDirectProbeError)
    emitBridgeState()

    return () => {
        disposed = true
        if (statsSampleTimer) clearInterval(statsSampleTimer)
        unsubscribeTransport()
        relay?.dispose()
        eventBroadcaster.dispose()
        telemetry.dispose()
        stats?.dispose()
        transport?.dispose()
        channel?.close()
        try {
            client.closeAllTerminals()
        } catch (error) {
            if (!(error instanceof HubPausedError)) throw error
        }
    }

    function reportAsyncError(message: string, error: unknown): void {
        if (disposed || isHubPausedError(error)) return
        fatalMessage = `${message}${error instanceof Error ? error.message : String(error)}`
        emitBridgeState()
    }

    function reportEventReplayError(error: unknown): void {
        reportAsyncError('配对事件流发送失败：', error)
    }

    function handleRejected(reason: string): void {
        if (disposed || rejected) return
        rejected = true
        trace.emit({ event: 'fatal', payloadMeta: { source: 'relay', reason } })
        // The credential is permanently dead. Surface a terminal state and let
        // the owner drop the stored pairing; do not keep a bridge alive on it.
        fatalMessage = `配对已失效（${reason}），请重新扫码。`
        emitBridgeState()
        options.onRejected?.(reason)
    }

    function startDirectTransport(): void {
        transport = createPairingTransport({
            pairingId: options.pairing.pairing.id,
            polite: false,
            iceServers: toIceServers(options.pairing.iceServers),
            getWsUrl: async () => options.pairing.wsUrl,
            createDataChannel: true,
            onChannel: attachChannel,
            onPeerReplaced: rebuildDirectTransport,
        })
        directState = transport.getSnapshot()
        unsubscribeTransport = transport.subscribe(() => {
            directState = transport?.getSnapshot() ?? null
            handleTransportState()
            void sampleDirectStats().catch(reportDirectProbeError)
            emitBridgeState()
        })
    }

    function rebuildDirectTransport(): void {
        if (disposed || !directSupported || !transport) return
        if (routeState.activeRoute === 'direct' || routeState.directProbe !== 'idle') {
            commitRoute({ type: 'direct-failed', reason: 'peer-replaced' })
        }
        const staleChannel = channel
        channel = null
        staleChannel?.close()
        unsubscribeTransport()
        transport?.dispose()
        latestStats = null
        startDirectTransport()
        maybeReprobeDirect(true)
        emitBridgeState()
    }

    function attachChannel(nextChannel: RTCDataChannel): void {
        channel = nextChannel
        commitRoute({ type: 'direct-probe-started' })
        emitBridgeState()
        attachPairingBridgeDataChannel({
            channel: nextChannel,
            commitDirectCandidateFromStats,
            commitRoute,
            emitBridgeState,
            getClient: () => client,
            getLatestStats: () => latestStats,
            getRouteGeneration: () => routeState.routeGeneration,
            isCurrentChannel: () => channel === nextChannel,
            isDisposed: () => disposed,
            maybeReprobeDirect,
            replayEventsAfter: (seq, sink) => eventBroadcaster.replayAfter(seq, sink, reportEventReplayError),
            reportAsyncError,
            reportDirectProbeError,
            sampleDirectStats,
            startEventStream: (sink) => {
                disposeDirectEventSink?.()
                disposeDirectEventSink = eventBroadcaster.addSink('direct', sink, reportEventReplayError)
                eventBroadcaster.replayAfter(0, sink, reportEventReplayError)
            },
            stopEventStream: () => {
                disposeDirectEventSink?.()
                disposeDirectEventSink = null
            },
        })
    }

    function maybeReprobeDirect(force = false): void {
        reprobeDesktopDirect({ attachChannel, channel, force, routeState, transport })
    }

    function commitRoute(event: PairingTunnelRouteEvent): void {
        const nextRouteState = commitPairingBridgeRoute({ event, routeState, trace })
        if (nextRouteState === routeState) return
        routeState = nextRouteState
        emitBridgeState()
    }

    function commitDirectCandidateFromStats(stats: PairingBridgeStats): void {
        const event =
            routeState.directProbe === 'probing' || routeState.activeRoute === 'direct'
                ? readDesktopTunnelDirectCandidateEvent(stats)
                : null
        if (event?.type === 'direct-candidate-selected') {
            commitRoute({ ...event, routeGeneration: routeState.routeGeneration })
        }
    }

    async function sampleDirectStats(): Promise<void> {
        const nextStats = await stats?.sample()
        if (nextStats) commitDirectCandidateFromStats(nextStats)
        emitBridgeState()
    }

    function reportDirectProbeError(_error: unknown): void {
        commitRoute({ type: 'direct-failed', reason: 'ice-failed', routeGeneration: routeState.routeGeneration })
    }

    function reportDirectStatsError(_message: string, _error: unknown): void {
        commitRoute({ type: 'direct-failed', reason: 'ice-failed', routeGeneration: routeState.routeGeneration })
    }

    function reportTelemetryError(message: string, error: unknown): void {
        telemetryWarning = `${message}${error instanceof Error ? error.message : String(error)}`
        trace.emit({ event: 'rpc.failure', payloadMeta: { source: 'telemetry', message: telemetryWarning } })
        emitBridgeState()
    }

    function handleTransportState(): void {
        if (
            directState?.kind !== 'fatal' ||
            (routeState.activeRoute !== 'direct' && routeState.directProbe === 'failed')
        )
            return
        commitRoute({ type: 'direct-failed', reason: directState.reason })
    }

    function emitBridgeState(): void {
        emitPairingBridgeState({
            directState,
            disposed,
            fatalMessage,
            latestStats,
            onStateChange: options.onStateChange,
            pairing: options.pairing,
            routeState,
            telemetryWarning,
        })
    }

    function installTraceExporter(): void {
        if (typeof window === 'undefined') return
        window.__vibyExportHostSessionTrace = () => JSON.stringify(trace.export(), null, 2)
    }
}
