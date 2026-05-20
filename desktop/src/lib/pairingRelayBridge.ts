import {
    computePairingReconnectDelay,
    createPairingTunnelCipher,
    createPairingTunnelKeyFrame,
    PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS,
    PAIRING_PEER_HEARTBEAT_INTERVAL_MS,
    type PairingPeerHeartbeat,
    PairingPeerMessageSchema,
    type PairingTunnelCipher,
    PairingTunnelFrameSchema,
    type PairingTunnelPlainFrame,
} from '@viby/protocol/pairing'
import type { LocalHubPairingClient } from './localHubPairingClient'
import {
    canSendPairingPeerText,
    handlePairingPeerPayload,
    type PairingPeerTextSink,
} from './pairingBridgeControllerSupport'
import { startPairingEventStream } from './pairingEventStream'

const SOCKET_OPEN = 1

type RelaySocket = WebSocket

export interface PairingRelayBridgeHandle {
    dispose(): void
    isReady(): boolean
}

export function startPairingRelayBridge(options: {
    getClient: () => LocalHubPairingClient
    isDisposed: () => boolean
    onActive: (sample?: { roundTripTimeMs?: number | null; sampledAt?: number | null }) => void
    onClosed: () => void
    onOpen: () => void
    reportAsyncError: (message: string, error: unknown) => void
    tunnelUrl: string
}): PairingRelayBridgeHandle {
    let disposed = false
    let ready = false
    let socket: RelaySocket | null = null
    let cipher: PairingTunnelCipher | null = null
    let peerPublicKey: string | null = null
    let seq = 0
    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let eventStreamAbort: AbortController | null = null
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let pendingHeartbeat: { id: string; sentAt: number } | null = null

    connect()
    return {
        dispose,
        isReady: () => ready,
    }

    function connect(): void {
        if (disposed || options.isDisposed()) return
        socket = new WebSocket(options.tunnelUrl)
        socket.onopen = () =>
            void handleOpen(socket).catch((error) => {
                reportRelayError(error)
                socket?.close()
            })
        socket.onmessage = (event) => void handleFrame(event.data).catch(reportRelayError)
        socket.onclose = () => handleClose()
        socket.onerror = () => socket?.close()
    }

    function dispose(): void {
        disposed = true
        clearReconnectTimer()
        stopHeartbeat()
        stopEventStream()
        socket?.close()
        socket = null
        cipher = null
        peerPublicKey = null
    }

    async function handleOpen(activeSocket: RelaySocket | null): Promise<void> {
        if (!activeSocket) return
        ready = false
        cipher = await createPairingTunnelCipher()
        peerPublicKey = null
        sendLocalKey(activeSocket)
        reconnectAttempt = 0
    }

    function handleClose(): void {
        if (ready) {
            ready = false
            options.onClosed()
        }
        stopEventStream()
        stopHeartbeat()
        cipher = null
        peerPublicKey = null
        if (!disposed && !options.isDisposed()) scheduleReconnect()
    }

    async function handleFrame(data: unknown): Promise<void> {
        if (typeof data !== 'string' || !socket) return
        const frame = PairingTunnelFrameSchema.parse(JSON.parse(data) as unknown)
        if (frame.kind === 'key') {
            const activeCipher = requireCipher()
            const shouldReply = peerPublicKey !== frame.publicKey
            peerPublicKey = frame.publicKey
            await activeCipher.receivePeerKey(frame.publicKey)
            if (shouldReply && socket.readyState === SOCKET_OPEN) sendLocalKey(socket)
            handleSecureOpen()
            return
        }
        if (frame.kind !== 'sealed') return
        const plainFrame = await requireCipher().open(frame)
        if (plainFrame.kind !== 'message') return
        await handlePairingPeerPayload({
            data: JSON.stringify(plainFrame.payload),
            getClient: options.getClient,
            onActive: options.onActive,
            onHeartbeat: markHeartbeatAck,
            sink: createRelaySink(socket),
        })
    }

    function handleSecureOpen(): void {
        if (ready) return
        ready = true
        options.onOpen()
        startRelayEventStream()
        startHeartbeat()
    }

    function requireCipher(): PairingTunnelCipher {
        if (!cipher) throw new Error('relay tunnel cipher is not ready')
        return cipher
    }

    function sendLocalKey(activeSocket: RelaySocket): void {
        activeSocket.send(
            JSON.stringify(
                createPairingTunnelKeyFrame({
                    id: `desktop-key-${Date.now()}`,
                    seq: seq++,
                    publicKey: requireCipher().publicKey,
                })
            )
        )
    }

    async function sendSealedFrame(activeSocket: RelaySocket, data: string): Promise<void> {
        if (activeSocket.readyState !== SOCKET_OPEN) return
        const plainFrame: PairingTunnelPlainFrame = {
            kind: 'message',
            id: `desktop-relay-${Date.now()}-${seq}`,
            seq: seq++,
            payload: PairingPeerMessageSchema.parse(JSON.parse(data) as unknown),
        }
        activeSocket.send(JSON.stringify(await requireCipher().seal(plainFrame)))
    }

    function createRelaySink(activeSocket: RelaySocket): PairingPeerTextSink {
        return {
            get readyState() {
                return activeSocket.readyState
            },
            send: (data) => sendFrame(activeSocket, data),
        }
    }

    function sendFrame(activeSocket: RelaySocket, data: string): void {
        void sendSealedFrame(activeSocket, data).catch(reportRelayError)
    }

    function startRelayEventStream(): void {
        const activeSocket = socket
        if (!activeSocket || !canSendPairingPeerText(createRelaySink(activeSocket))) return
        stopEventStream()
        const abortController = new AbortController()
        eventStreamAbort = abortController
        void startPairingEventStream(options.getClient(), createRelaySink(activeSocket), abortController).catch(
            reportRelayError
        )
    }

    function stopEventStream(): void {
        eventStreamAbort?.abort()
        eventStreamAbort = null
    }

    function startHeartbeat(): void {
        stopHeartbeat()
        sendHeartbeat()
        heartbeatTimer = setInterval(sendHeartbeat, PAIRING_PEER_HEARTBEAT_INTERVAL_MS)
        if (typeof heartbeatTimer === 'object' && 'unref' in heartbeatTimer) heartbeatTimer.unref()
    }

    function stopHeartbeat(): void {
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        heartbeatTimer = null
        pendingHeartbeat = null
    }

    function sendHeartbeat(): void {
        const activeSocket = socket
        const now = Date.now()
        if (!ready || !activeSocket || activeSocket.readyState !== SOCKET_OPEN) return
        if (pendingHeartbeat && now - pendingHeartbeat.sentAt < PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS) return
        const heartbeat: PairingPeerHeartbeat = { kind: 'heartbeat', id: `desktop-relay-${now}-${seq}`, sentAt: now }
        pendingHeartbeat = { id: heartbeat.id ?? '', sentAt: now }
        sendFrame(activeSocket, JSON.stringify(heartbeat))
    }

    function markHeartbeatAck(heartbeat: PairingPeerHeartbeat) {
        if (!heartbeat.ack || !heartbeat.id || heartbeat.id !== pendingHeartbeat?.id) return undefined
        const sampledAt = Date.now()
        const roundTripTimeMs = sampledAt - pendingHeartbeat.sentAt
        pendingHeartbeat = null
        return { roundTripTimeMs, sampledAt }
    }

    function scheduleReconnect(): void {
        clearReconnectTimer()
        reconnectAttempt += 1
        reconnectTimer = setTimeout(connect, computePairingReconnectDelay(reconnectAttempt))
    }

    function clearReconnectTimer(): void {
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = null
    }

    function reportRelayError(error: unknown): void {
        options.reportAsyncError('配对中转链路处理失败：', error)
    }
}
