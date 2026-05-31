import { PROTOCOL_VERSION } from '@viby/protocol'
import {
    classifyFatalPairingClose,
    computePairingReconnectDelay,
    createPairingTunnelKeyFrame,
    PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS,
    PAIRING_PEER_HEARTBEAT_INTERVAL_MS,
    type PairingPeerHeartbeat,
    PairingPeerMessageSchema,
    type PairingSocketCloseInfo,
    type PairingTunnelBinaryFrame,
    PairingTunnelFrameSchema,
    type PairingTunnelPlainFrame,
    tryOpenPairingTunnelPlainFrame,
} from '@viby/protocol/pairing'
import type { LocalHubPairingClient } from './localHubPairingClient'
import {
    canSendPairingPeerText,
    handlePairingPeerPayload,
    type PairingPeerTextSink,
} from './pairingBridgeControllerSupport'
import { startPairingEventStream } from './pairingEventStream'
import {
    buildPairingRelayUploadFrame,
    createRelayPeer,
    defaultScheduleInterval,
    defaultScheduleTimeout,
    parseJson,
    type RelayPeer,
    type RelaySocket,
    type ScheduleInterval,
    type ScheduleTimeout,
} from './pairingRelayBridgeRuntime'

const SOCKET_OPEN = 1
const DEFAULT_CONNECTION_ID = 'default'
const RELAY_PEER_IDLE_TIMEOUT_MS = PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS

export interface PairingRelayBridgeHandle {
    dispose(): void
    isReady(): boolean
}

export function startPairingRelayBridge(options: {
    getClient: () => LocalHubPairingClient
    isDisposed: () => boolean
    onActive: (sample?: { roundTripTimeMs?: number | null; sampledAt?: number | null }) => void
    onClosed: () => void
    /**
     * The broker permanently rejected this pairing (stale/invalid host token,
     * deleted/expired session). The bridge has stopped reconnecting; the owner
     * must drop the pairing instead of letting a dead credential churn the
     * broker origin and starve a fresh scan.
     */
    onFatal?: (reason: string) => void
    onOpen: () => void
    onPeerReplaced?: () => void
    reportAsyncError: (message: string, error: unknown) => void
    now?: () => number
    randomJitter?: () => number
    scheduleInterval?: ScheduleInterval
    scheduleTimeout?: ScheduleTimeout
    socketFactory?: (url: string) => RelaySocket
    tunnelUrl: string
}): PairingRelayBridgeHandle {
    let disposed = false
    let fatal = false
    let ready = false
    let socket: RelaySocket | null = null
    let seq = 0
    let reconnectAttempt = 0
    let cancelReconnect: (() => void) | null = null
    let cancelHeartbeat: (() => void) | null = null
    const createSocket = options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as RelaySocket)
    const now = options.now ?? Date.now
    const scheduleInterval = options.scheduleInterval ?? defaultScheduleInterval
    const scheduleTimeout = options.scheduleTimeout ?? defaultScheduleTimeout
    const peers = new Map<string, RelayPeer>()

    connect()
    return { dispose, isReady: () => ready }

    function connect(): void {
        if (disposed || fatal || options.isDisposed()) return
        const nextSocket = createSocket(options.tunnelUrl)
        socket = nextSocket
        nextSocket.onopen = () => void handleOpen(nextSocket).catch((error) => closeAfterError(nextSocket, error))
        nextSocket.onmessage = (event: { data: unknown }) =>
            void handleFrame(nextSocket, event.data).catch(reportRelayError)
        nextSocket.onclose = (event) => handleClose(nextSocket, event)
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
        const peer = await createRelayPeer()
        peers.set(DEFAULT_CONNECTION_ID, peer)
        sendLocalKey(activeSocket, DEFAULT_CONNECTION_ID)
        reconnectAttempt = 0
    }

    function handleClose(activeSocket: RelaySocket, closeInfo?: PairingSocketCloseInfo): void {
        if (socket !== activeSocket) return
        if (ready) {
            ready = false
            options.onClosed()
        }
        stopSecureSession()
        peers.clear()
        if (disposed || options.isDisposed()) return
        // A permanently rejected credential (stale/invalid token, deleted /
        // expired pairing) must go terminal — reconnecting here is exactly what
        // floods the broker origin and starves a fresh scan.
        const fatalReason = classifyFatalPairingClose(closeInfo)
        if (fatalReason) {
            fatal = true
            clearReconnectTimer()
            options.onFatal?.(fatalReason)
            return
        }
        scheduleReconnect()
    }

    async function handleFrame(activeSocket: RelaySocket, data: unknown): Promise<void> {
        if (typeof data !== 'string' || socket !== activeSocket) return
        const frame = PairingTunnelFrameSchema.safeParse(parseJson(data))
        if (!frame.success) return
        const connectionId = frame.data.connectionId ?? DEFAULT_CONNECTION_ID
        if (frame.data.kind === 'key') {
            if (connectionId !== DEFAULT_CONNECTION_ID) removePeer(DEFAULT_CONNECTION_ID)
            const peer = await getPeer(connectionId)
            const peerChanged = peer.peerPublicKey !== null && peer.peerPublicKey !== frame.data.publicKey
            const shouldReply = peer.peerPublicKey !== frame.data.publicKey
            peer.peerPublicKey = frame.data.publicKey
            await peer.cipher.receivePeerKey(frame.data.publicKey)
            if (shouldReply && activeSocket.readyState === SOCKET_OPEN) sendLocalKey(activeSocket, connectionId)
            if (ready && peerChanged) options.onPeerReplaced?.()
            handleSecureOpen(connectionId)
            return
        }
        if (frame.data.kind !== 'sealed') return
        const plainFrame = await tryOpenPairingTunnelPlainFrame(requirePeer(connectionId).cipher, frame.data)
        if (!plainFrame) return
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
        await handlePairingPeerPayload({
            data: buildPairingRelayUploadFrame(frame),
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

    function removePeer(connectionId: string): void {
        const peer = peers.get(connectionId)
        peer?.eventStreamAbort?.abort()
        peers.delete(connectionId)
    }

    async function getPeer(connectionId: string): Promise<RelayPeer> {
        const existing = peers.get(connectionId)
        if (existing) return existing
        const created = await createRelayPeer()
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
                    id: `desktop-key-${now()}`,
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
            id: `desktop-relay-${now()}-${seq}`,
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
        cancelHeartbeat = scheduleInterval(sendHeartbeats, PAIRING_PEER_HEARTBEAT_INTERVAL_MS)
    }

    function stopHeartbeat(): void {
        cancelHeartbeat?.()
        cancelHeartbeat = null
        for (const peer of peers.values()) peer.pendingHeartbeat = null
    }

    function sendHeartbeats(): void {
        const activeSocket = socket
        const currentTime = now()
        if (!ready || !activeSocket || activeSocket.readyState !== SOCKET_OPEN) return
        for (const [connectionId, peer] of peers) {
            if (!peer.peerPublicKey) continue
            if (peer.pendingHeartbeat && currentTime - peer.pendingHeartbeat.sentAt >= RELAY_PEER_IDLE_TIMEOUT_MS) {
                removePeer(connectionId)
                continue
            }
            if (peer.pendingHeartbeat) continue
            const heartbeat: PairingPeerHeartbeat = {
                kind: 'heartbeat',
                id: `desktop-relay-${currentTime}-${seq}`,
                protocolVersion: PROTOCOL_VERSION,
                sentAt: currentTime,
            }
            peer.pendingHeartbeat = { id: heartbeat.id ?? '', sentAt: currentTime }
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
        const sampledAt = now()
        const roundTripTimeMs = sampledAt - peer.pendingHeartbeat.sentAt
        peer.pendingHeartbeat = null
        return { roundTripTimeMs, sampledAt }
    }

    function scheduleReconnect(): void {
        clearReconnectTimer()
        reconnectAttempt += 1
        cancelReconnect = scheduleTimeout(connect, computePairingReconnectDelay(reconnectAttempt, options.randomJitter))
    }

    function clearReconnectTimer(): void {
        cancelReconnect?.()
        cancelReconnect = null
    }

    function closeAfterError(activeSocket: RelaySocket, error: unknown): void {
        reportRelayError(error)
        activeSocket.close()
    }

    function reportRelayError(error: unknown): void {
        options.reportAsyncError('配对中转链路处理失败：', error)
    }
}
