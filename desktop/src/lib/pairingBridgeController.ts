import {
    createPairingTransport,
    createPairingTunnelRouteState,
    PAIRING_STATS_POLL_INTERVAL_MS,
    type PairingTransportHandle,
    type PairingTransportState,
    type PairingTunnelRouteEvent,
    type PairingTunnelRouteState,
    reducePairingTunnelRoute,
} from '@viby/protocol/pairing'
import type {
    DesktopPairingSession,
    HubRuntimeStatus,
    PairingBridgeState,
    PairingBridgeStats,
    PairingIceServer,
} from '@/types'
import { reprobeDesktopDirect } from './desktopDirectReprobe'
import {
    buildDesktopTunnelBridgeState,
    readDesktopTunnelDirectCandidateEvent,
    readDesktopTunnelRouteStats,
} from './desktopTunnelRoute'
import { createDeferredHubClient } from './localHubPairingDeferredClient'
import { attachPairingDataChannel, HubPausedError, isHubPausedError } from './pairingBridgeControllerSupport'
import { startPairingBridgeStats } from './pairingBridgeStats'
import { startPairingBridgeTelemetry } from './pairingBridgeTelemetry'
import { type PairingRelayBridgeHandle, startPairingRelayBridge } from './pairingRelayBridge'

function toIceServers(servers: PairingIceServer[]): RTCIceServer[] {
    return servers.map((server) => ({ urls: server.urls, username: server.username, credential: server.credential }))
}

export function startPairingBridge(options: {
    pairing: DesktopPairingSession
    getStatus: () => HubRuntimeStatus | null
    onStateChange: (state: PairingBridgeState) => void
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
    let channel: RTCDataChannel | null = null
    let latestStats: PairingBridgeStats | null = null
    let fatalMessage: string | null = null
    let telemetryWarning: string | null = null
    let routeState = createPairingTunnelRouteState()
    let directState: PairingTransportState | null = null
    const client = createDeferredHubClient(options.getStatus)
    let transport: PairingTransportHandle | null = null
    let relay: PairingRelayBridgeHandle | null = null
    const directSupported = typeof RTCPeerConnection !== 'undefined'
    if (directSupported) {
        transport = createPairingTransport({
            pairingId: options.pairing.pairing.id,
            polite: false,
            iceServers: toIceServers(options.pairing.iceServers),
            getWsUrl: async () => options.pairing.wsUrl,
            createDataChannel: true,
            onChannel: attachChannel,
        })
        directState = transport.getSnapshot()
    }
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
              reportError: reportAsyncError,
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
    const unsubscribe =
        transport?.subscribe(() => {
            directState = transport?.getSnapshot() ?? null
            handleTransportState()
            void sampleDirectStats().catch(reportDirectProbeError)
            emitBridgeState()
        }) ?? (() => {})
    void sampleDirectStats().catch(reportDirectProbeError)
    emitBridgeState()

    return () => {
        disposed = true
        if (statsSampleTimer) clearInterval(statsSampleTimer)
        unsubscribe()
        relay?.dispose()
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

    function attachChannel(nextChannel: RTCDataChannel): void {
        channel = nextChannel
        commitRoute({ type: 'direct-probe-started' })
        emitBridgeState()
        attachPairingDataChannel({
            channel: nextChannel,
            getClient: () => client,
            isDisposed: () => disposed,
            onChannelOpen: () => {
                if (channel !== nextChannel) return
                emitBridgeState()
            },
            onChannelActive: () => {
                if (channel !== nextChannel) return
                commitRoute({
                    type: 'heartbeat-ack',
                    route: 'direct',
                    roundTripTimeMs: latestStats?.currentRoundTripTimeMs,
                    sampledAt: latestStats?.sampledAt,
                })
                if (latestStats) commitDirectCandidateFromStats(latestStats)
                void sampleDirectStats().catch(reportDirectProbeError)
                emitBridgeState()
            },
            onChannelClosed: () => {
                if (channel !== nextChannel) return
                commitRoute({ type: 'direct-failed', reason: 'closed' })
                maybeReprobeDirect(true)
                emitBridgeState()
            },
            startEventStream: async () => {},
            stopEventStream: () => {},
            reportAsyncError,
        })
    }

    function maybeReprobeDirect(force = false): void {
        reprobeDesktopDirect({ attachChannel, channel, force, routeState, transport })
    }

    function commitRoute(event: PairingTunnelRouteEvent): void {
        const previous = routeState
        routeState = reducePairingTunnelRoute(routeState, event)
        if (routeState !== previous) emitBridgeState()
    }

    function commitDirectCandidateFromStats(stats: PairingBridgeStats): void {
        const event =
            routeState.directProbe === 'probing' || routeState.activeRoute === 'direct'
                ? readDesktopTunnelDirectCandidateEvent(stats)
                : null
        if (event) commitRoute(event)
    }

    async function sampleDirectStats(): Promise<void> {
        const nextStats = await stats?.sample()
        if (nextStats) commitDirectCandidateFromStats(nextStats)
        emitBridgeState()
    }

    function reportDirectProbeError(error: unknown): void {
        reportAsyncError('配对直连探测失败：', error)
    }

    function reportTelemetryError(message: string, error: unknown): void {
        telemetryWarning = `${message}${error instanceof Error ? error.message : String(error)}`
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
        if (disposed) return
        if (fatalMessage) {
            options.onStateChange({
                phase: 'fatal',
                message: fatalMessage,
                pairing: options.pairing.pairing,
                stats: null,
            })
            return
        }
        const state = buildDesktopTunnelBridgeState({
            base: options.pairing,
            directState,
            routeState,
            stats: readDesktopTunnelRouteStats(routeState, latestStats),
        })
        options.onStateChange(
            telemetryWarning && state.phase === 'ready' ? { ...state, message: telemetryWarning } : state
        )
    }
}
