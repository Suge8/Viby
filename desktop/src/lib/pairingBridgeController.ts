import { createPairingTransport, type PairingTransportHandle } from '@viby/protocol/pairing'
import type { DesktopPairingSession, HubRuntimeStatus, PairingBridgeState, PairingIceServer } from '@/types'
import { LocalHubPairingClient } from './localHubPairingClient'
import { attachPairingDataChannel } from './pairingBridgeControllerSupport'
import { startPairingBridgeStats } from './pairingBridgeStats'
import { createPairingPresenceReporter } from './pairingPresenceSync'

function toIceServers(servers: PairingIceServer[]): RTCIceServer[] {
    return servers.map((server) => ({ urls: server.urls, username: server.username, credential: server.credential }))
}

function bridgeStateFromTransport(transport: PairingTransportHandle, base: DesktopPairingSession): PairingBridgeState {
    const state = transport.getSnapshot()
    if (state.kind === 'ready') return { phase: 'ready', message: '已连接', pairing: base.pairing }
    if (state.kind === 'fatal') return { phase: 'fatal', message: state.reason, pairing: base.pairing, stats: null }
    return { phase: 'connecting', message: state.attempt > 0 ? `正在握手（${state.attempt}）` : '正在握手', pairing: base.pairing }
}

export function startPairingBridge(options: {
    pairing: DesktopPairingSession
    status: HubRuntimeStatus
    onStateChange: (state: PairingBridgeState) => void
}): () => void {
    if (typeof RTCPeerConnection === 'undefined' || typeof WebSocket === 'undefined') {
        options.onStateChange({ phase: 'fatal', message: '当前环境不支持 WebRTC。', pairing: options.pairing.pairing, stats: null })
        return () => {}
    }

    let disposed = false
    let eventStreamAbort: AbortController | null = null
    let channel: RTCDataChannel | null = null
    const client = new LocalHubPairingClient({ baseUrl: options.status.localHubUrl, cliApiToken: options.status.cliApiToken })
    const presence = createPairingPresenceReporter({ client, pairingId: options.pairing.pairing.id, onError: reportAsyncError })
    const transport = createPairingTransport({
        pairingId: options.pairing.pairing.id,
        polite: false,
        iceServers: toIceServers(options.pairing.iceServers),
        getWsUrl: async () => options.pairing.wsUrl,
        createDataChannel: true,
        onChannel: attachChannel,
    })
    const stats = startPairingBridgeStats({
        getPeer: () => transport.getPeer() as unknown as RTCPeerConnection,
        setStats: (nextStats) => options.onStateChange({ ...bridgeStateFromTransport(transport, options.pairing), stats: nextStats }),
        reportError: reportAsyncError,
    })
    const unsubscribe = transport.subscribe(() => options.onStateChange(bridgeStateFromTransport(transport, options.pairing)))
    options.onStateChange({ phase: 'connecting', message: '正在握手', pairing: options.pairing.pairing, stats: null })

    return () => {
        disposed = true
        unsubscribe()
        stopEventStream()
        stats.dispose()
        transport.dispose()
        channel?.close()
        presence.dispose()
        client.closeAllTerminals()
    }

    function reportAsyncError(message: string, error: unknown): void {
        if (disposed) return
        options.onStateChange({ phase: 'fatal', message: `${message}${error instanceof Error ? error.message : String(error)}`, pairing: options.pairing.pairing, stats: null })
    }

    function attachChannel(nextChannel: RTCDataChannel): void {
        channel = nextChannel
        attachPairingDataChannel({
            channel: nextChannel,
            client,
            isDisposed: () => disposed,
            setBridgeState: (state) => options.onStateChange({ pairing: options.pairing.pairing, ...state }),
            startEventStream,
            stopEventStream,
            reportPairingPresence: emitPresence,
            reportAsyncError,
        })
    }

    function emitPresence(alive: boolean): void {
        const guest = options.pairing.pairing.guest
        const platform = guest?.metadata?.platform
        presence.set(alive, { deviceName: guest?.label, platform: typeof platform === 'string' ? platform : undefined })
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
