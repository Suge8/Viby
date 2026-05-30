import { PROTOCOL_VERSION } from '@viby/protocol'
import {
    computePairingReconnectDelay,
    createPairingTunnelCipher,
    createPairingTunnelKeyFrame,
    createPairingUploadChunkFrame,
    fromPairingTunnelBase64Url,
    PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS,
    PAIRING_PEER_HEARTBEAT_INTERVAL_MS,
    type PairingPeerHeartbeat,
    PairingPeerMessageSchema,
    type PairingTunnelBinaryFrame,
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
const DEFAULT_CONNECTION_ID = 'default'
const RELAY_PEER_IDLE_TIMEOUT_MS = PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS

type RelaySocket = WebSocket

type RelayPeer = {
    cipher: PairingTunnelCipher
    eventStreamAbort: AbortController | null
    pendingHeartbeat: { id: string; sentAt: number } | null
    peerPublicKey: string | null
}

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
    onPeerReplaced?: () => void
    reportAsyncError: (message: string, error: unknown) => void
    tunnelUrl: string
}): PairingRelayBridgeHandle {
    let disposed = false
    let ready = false
    let socket: RelaySocket | null = null
    let seq = 0
    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    const peers = new Map<string, RelayPeer>()

    connect()
    return { dispose, isReady: () => ready }

    function connect(): void {
        if (disposed || options.isDisposed()) return
        const nextSocket = new WebSocket(options.tunnelUrl)
        socket = nextSocket
        nextSocket.onopen = () => void handleOpen(nextSocket).catch((error) => closeAfterError(nextSocket, error))
        nextSocket.onmessage = (event) => void handleFrame(nextSocket, event.data).catch(reportRelayError)
        nextSocket.onclose = () => handleClose(nextSocket)
        nextSocket.onerror = () => nextSocket.close()
    }

    function dispose(): void {
        disposed = true
        clearReconnectTimer()
        stopSecureSession()
        socket?.close()
        socket = null
        peers.clear()
    }

    async function handleOpen(activeSocket: RelaySocket): Promise<void> {
        if (socket !== activeSocket) return
        ready = false
        stopSecureSession()
        peers.clear()
        const peer = await createPeer()
        peers.set(DEFAULT_CONNECTION_ID, peer)
        sendLocalKey(activeSocket, DEFAULT_CONNECTION_ID)
        reconnectAttempt = 0
    }

    function handleClose(activeSocket: RelaySocket): void {
        if (socket !== activeSocket) return
        if (ready) {
            ready = false
            options.onClosed()
        }
        stopSecureSession()
        peers.clear()
        if (!disposed && !options.isDisposed()) scheduleReconnect()
    }

    async function handleFrame(activeSocket: RelaySocket, data: unknown): Promise<void> {
        if (typeof data !== 'string' || socket !== activeSocket) return
        const frame = PairingTunnelFrameSchema.parse(JSON.parse(data) as unknown)
        const connectionId = frame.connectionId ?? DEFAULT_CONNECTION_ID
        if (frame.kind === 'key') {
            if (connectionId !== DEFAULT_CONNECTION_ID) removePeer(DEFAULT_CONNECTION_ID)
            const peer = await getPeer(connectionId)
            const peerChanged = peer.peerPublicKey !== null && peer.peerPublicKey !== frame.publicKey
            const shouldReply = peer.peerPublicKey !== frame.publicKey
            peer.peerPublicKey = frame.publicKey
            await peer.cipher.receivePeerKey(frame.publicKey)
            if (shouldReply && activeSocket.readyState === SOCKET_OPEN) sendLocalKey(activeSocket, connectionId)
            if (ready && peerChanged) options.onPeerReplaced?.()
            handleSecureOpen(connectionId)
            return
        }
        if (frame.kind !== 'sealed') return
        const plainFrame = await requirePeer(connectionId).cipher.open(frame)
        if (plainFrame.kind === 'binary') return await handleRelayBinaryChunk(activeSocket, connectionId, plainFrame)
        if (plainFrame.kind !== 'message') return
        await handlePairingPeerPayload({
            data: JSON.stringify(plainFrame.payload),
            getClient: options.getClient,
            onActive: options.onActive,
            onHeartbeat: (heartbeat) => markHeartbeatAck(connectionId, heartbeat),
            onSendError: reportRelayError,
            sink: createRelaySink(activeSocket, connectionId),
        })
    }

    async function handleRelayBinaryChunk(
        activeSocket: RelaySocket,
        connectionId: string,
        frame: PairingTunnelBinaryFrame
    ): Promise<void> {
        const bytes = fromPairingTunnelBase64Url(frame.bytesBase64)
        const magicFrame = createPairingUploadChunkFrame({
            chunk: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            chunkIndex: frame.chunkIndex,
            final: frame.chunkIndex === frame.chunkCount - 1,
            transferId: frame.transferId,
        })
        await handlePairingPeerPayload({
            data: magicFrame,
            getClient: options.getClient,
            onActive: options.onActive,
            onSendError: reportRelayError,
            sink: createRelaySink(activeSocket, connectionId),
        })
    }

    function handleSecureOpen(connectionId: string): void {
        if (!ready) {
            ready = true
            options.onOpen()
            startHeartbeat()
        }
        startRelayEventStream(connectionId)
    }

    function stopSecureSession(): void {
        stopEventStreams()
        stopHeartbeat()
    }

    async function createPeer(): Promise<RelayPeer> {
        return {
            cipher: await createPairingTunnelCipher(),
            eventStreamAbort: null,
            pendingHeartbeat: null,
            peerPublicKey: null,
        }
    }

    function removePeer(connectionId: string): void {
        const peer = peers.get(connectionId)
        peer?.eventStreamAbort?.abort()
        peers.delete(connectionId)
    }

    async function getPeer(connectionId: string): Promise<RelayPeer> {
        const existing = peers.get(connectionId)
        if (existing) return existing
        const created = await createPeer()
        peers.set(connectionId, created)
        return created
    }

    function requirePeer(connectionId: string): RelayPeer {
        const peer = peers.get(connectionId)
        if (!peer) throw new Error('relay tunnel cipher is not ready')
        return peer
    }

    function sendLocalKey(activeSocket: RelaySocket, connectionId: string): void {
        activeSocket.send(
            JSON.stringify(
                createPairingTunnelKeyFrame({
                    id: `desktop-key-${Date.now()}`,
                    seq: seq++,
                    connectionId: connectionId === DEFAULT_CONNECTION_ID ? undefined : connectionId,
                    publicKey: requirePeer(connectionId).cipher.publicKey,
                })
            )
        )
    }

    async function sendSealedFrame(activeSocket: RelaySocket, connectionId: string, data: string): Promise<void> {
        if (activeSocket.readyState !== SOCKET_OPEN) return
        const plainFrame: PairingTunnelPlainFrame = {
            kind: 'message',
            id: `desktop-relay-${Date.now()}-${seq}`,
            seq: seq++,
            payload: PairingPeerMessageSchema.parse(JSON.parse(data) as unknown),
        }
        const sealed = await requirePeer(connectionId).cipher.seal(plainFrame)
        activeSocket.send(
            JSON.stringify({
                ...sealed,
                connectionId: connectionId === DEFAULT_CONNECTION_ID ? undefined : connectionId,
            })
        )
    }

    function createRelaySink(activeSocket: RelaySocket, connectionId: string): PairingPeerTextSink {
        return {
            get readyState() {
                return activeSocket.readyState
            },
            send: (data) => void sendSealedFrame(activeSocket, connectionId, data).catch(reportRelayError),
        }
    }

    function startRelayEventStream(connectionId: string): void {
        const activeSocket = socket
        const peer = peers.get(connectionId)
        if (
            !activeSocket ||
            !peer?.peerPublicKey ||
            !canSendPairingPeerText(createRelaySink(activeSocket, connectionId))
        )
            return
        peer.eventStreamAbort?.abort()
        const abortController = new AbortController()
        peer.eventStreamAbort = abortController
        void startPairingEventStream(
            options.getClient(),
            createRelaySink(activeSocket, connectionId),
            abortController,
            reportRelayError
        ).catch(reportRelayError)
    }

    function stopEventStreams(): void {
        for (const peer of peers.values()) {
            peer.eventStreamAbort?.abort()
            peer.eventStreamAbort = null
        }
    }

    function startHeartbeat(): void {
        stopHeartbeat()
        sendHeartbeats()
        heartbeatTimer = setInterval(sendHeartbeats, PAIRING_PEER_HEARTBEAT_INTERVAL_MS)
        if (typeof heartbeatTimer === 'object' && 'unref' in heartbeatTimer) heartbeatTimer.unref()
    }

    function stopHeartbeat(): void {
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        heartbeatTimer = null
        for (const peer of peers.values()) peer.pendingHeartbeat = null
    }

    function sendHeartbeats(): void {
        const activeSocket = socket
        const now = Date.now()
        if (!ready || !activeSocket || activeSocket.readyState !== SOCKET_OPEN) return
        for (const [connectionId, peer] of peers) {
            if (!peer.peerPublicKey) continue
            if (peer.pendingHeartbeat && now - peer.pendingHeartbeat.sentAt >= RELAY_PEER_IDLE_TIMEOUT_MS) {
                removePeer(connectionId)
                continue
            }
            if (peer.pendingHeartbeat) continue
            const heartbeat: PairingPeerHeartbeat = {
                kind: 'heartbeat',
                id: `desktop-relay-${now}-${seq}`,
                protocolVersion: PROTOCOL_VERSION,
                sentAt: now,
            }
            peer.pendingHeartbeat = { id: heartbeat.id ?? '', sentAt: now }
            void sendSealedFrame(activeSocket, connectionId, JSON.stringify(heartbeat)).catch(reportRelayError)
        }
        if (ready && !hasSecurePeers()) {
            ready = false
            options.onClosed()
        }
    }

    function hasSecurePeers(): boolean {
        return [...peers.values()].some((peer) => peer.peerPublicKey)
    }

    function markHeartbeatAck(connectionId: string, heartbeat: PairingPeerHeartbeat) {
        const peer = peers.get(connectionId)
        if (!peer || !heartbeat.ack || !heartbeat.id || heartbeat.id !== peer.pendingHeartbeat?.id) return undefined
        const sampledAt = Date.now()
        const roundTripTimeMs = sampledAt - peer.pendingHeartbeat.sentAt
        peer.pendingHeartbeat = null
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

    function closeAfterError(activeSocket: RelaySocket, error: unknown): void {
        reportRelayError(error)
        activeSocket.close()
    }

    function reportRelayError(error: unknown): void {
        options.reportAsyncError('配对中转链路处理失败：', error)
    }
}
