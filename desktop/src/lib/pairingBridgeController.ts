import { createPairingTransport, type PairingTransportHandle } from '@viby/protocol/pairing'
import type {
    DesktopPairingSession,
    HubRuntimeStatus,
    PairingBridgeState,
    PairingBridgeStats,
    PairingIceServer,
} from '@/types'
import { LocalHubPairingClient } from './localHubPairingClient'
import { attachPairingDataChannel, HubPausedError, isHubPausedError } from './pairingBridgeControllerSupport'
import { startPairingBridgeStats } from './pairingBridgeStats'

function toIceServers(servers: PairingIceServer[]): RTCIceServer[] {
    return servers.map((server) => ({ urls: server.urls, username: server.username, credential: server.credential }))
}

function bridgeStateFromTransport(options: {
    transport: PairingTransportHandle
    base: DesktopPairingSession
    channelReady: boolean
    stats: PairingBridgeStats | null
}): PairingBridgeState {
    const { transport, base, channelReady, stats } = options
    const state = transport.getSnapshot()
    if (state.kind === 'ready' && channelReady)
        return { phase: 'ready', message: '已连接', pairing: base.pairing, stats }
    if (state.kind === 'fatal') return { phase: 'fatal', message: state.reason, pairing: base.pairing, stats: null }
    return {
        phase: 'connecting',
        message:
            state.kind === 'ready'
                ? '正在建立数据通道'
                : state.attempt > 0
                  ? `正在握手（${state.attempt}）`
                  : '正在握手',
        pairing: base.pairing,
        stats,
    }
}

function createDeferredHubClient(getStatus: () => HubRuntimeStatus | null): LocalHubPairingClient {
    let client: LocalHubPairingClient | null = null
    let key = ''
    function current(): LocalHubPairingClient {
        const status = getStatus()
        if (!status || status.phase !== 'ready') throw new HubPausedError()
        const nextKey = `${status.localHubUrl}|${status.cliApiToken}`
        if (!client || nextKey !== key) {
            client?.closeAllTerminals()
            client = new LocalHubPairingClient({ baseUrl: status.localHubUrl, cliApiToken: status.cliApiToken })
            key = nextKey
        }
        return client
    }
    return new Proxy({} as LocalHubPairingClient, {
        get: (_target, property) => {
            const value = (current() as unknown as Record<PropertyKey, unknown>)[property]
            return typeof value === 'function' ? value.bind(current()) : value
        },
    })
}

export function startPairingBridge(options: {
    pairing: DesktopPairingSession
    getStatus: () => HubRuntimeStatus | null
    onStateChange: (state: PairingBridgeState) => void
}): () => void {
    if (typeof RTCPeerConnection === 'undefined' || typeof WebSocket === 'undefined') {
        options.onStateChange({
            phase: 'fatal',
            message: '当前环境不支持 WebRTC。',
            pairing: options.pairing.pairing,
            stats: null,
        })
        return () => {}
    }

    let disposed = false
    let eventStreamAbort: AbortController | null = null
    let channel: RTCDataChannel | null = null
    let channelOpen = false
    let channelActive = false
    let latestStats: PairingBridgeStats | null = null
    let fatalMessage: string | null = null
    const client = createDeferredHubClient(options.getStatus)
    let transport: PairingTransportHandle | null = null
    transport = createPairingTransport({
        pairingId: options.pairing.pairing.id,
        polite: false,
        iceServers: toIceServers(options.pairing.iceServers),
        getWsUrl: async () => options.pairing.wsUrl,
        createDataChannel: true,
        onChannel: attachChannel,
    })
    const stats = startPairingBridgeStats({
        getPeer: () => {
            if (!transport) throw new Error('pairing transport is not ready')
            return transport.getPeer() as unknown as RTCPeerConnection
        },
        setStats: (nextStats) => {
            latestStats = nextStats
            emitBridgeState()
        },
        reportError: reportAsyncError,
    })
    const unsubscribe = transport.subscribe(emitBridgeState)
    emitBridgeState()

    return () => {
        disposed = true
        unsubscribe()
        stopEventStream()
        stats.dispose()
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
        channelOpen = nextChannel.readyState === 'open'
        channelActive = false
        emitBridgeState()
        attachPairingDataChannel({
            channel: nextChannel,
            getClient: () => client,
            isDisposed: () => disposed,
            onChannelOpen: () => {
                if (channel !== nextChannel) return
                channelOpen = true
                emitBridgeState()
            },
            onChannelActive: () => {
                if (channel !== nextChannel) return
                channelActive = true
                emitBridgeState()
            },
            onChannelClosed: () => {
                if (channel !== nextChannel) return
                channelOpen = false
                channelActive = false
                replaceClosedChannel()
                transport?.requestIceRestart()
                emitBridgeState()
            },
            startEventStream,
            stopEventStream,
            reportAsyncError,
        })
    }

    function replaceClosedChannel(): void {
        const peer = transport?.getPeer() as unknown as RTCPeerConnection | undefined
        if (!peer || peer.connectionState === 'closed') return
        attachChannel(peer.createDataChannel('control', { ordered: true }))
    }

    function emitBridgeState(): void {
        if (disposed || !transport) return
        if (fatalMessage) {
            options.onStateChange({
                phase: 'fatal',
                message: fatalMessage,
                pairing: options.pairing.pairing,
                stats: null,
            })
            return
        }
        options.onStateChange(
            bridgeStateFromTransport({
                transport,
                base: options.pairing,
                channelReady: channelOpen && channelActive,
                stats: latestStats,
            })
        )
    }

    async function startEventStream(activeChannel: RTCDataChannel): Promise<void> {
        stopEventStream()
        const abortController = new AbortController()
        eventStreamAbort = abortController
        const { startPairingEventStream } = await import('./pairingEventStream')
        await startPairingEventStream(client, activeChannel, abortController)
    }

    function stopEventStream(): void {
        eventStreamAbort?.abort()
        eventStreamAbort = null
    }
}
