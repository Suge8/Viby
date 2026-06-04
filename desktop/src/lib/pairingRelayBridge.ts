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
import type { PairingEventBroadcaster } from './pairingEventBroadcaster'
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

const RELAY_SOCKET_OPEN = 1
export function startPairingRelayBridge(options: {
    getClient: () => LocalHubPairingClient
    isDisposed: () => boolean
    onActive: (sample?: { roundTripTimeMs?: number | null; sampledAt?: number | null }) => void
    onClosed: () => void
    onFatal?: (reason: string) => void
    onOpen: () => void
    onPeerReplaced?: () => void
    events?: PairingEventBroadcaster
    reportAsyncError: (message: string, error: unknown) => void
    now?: () => number
    randomJitter?: () => number
    scheduleInterval?: ScheduleInterval
    scheduleTimeout?: ScheduleTimeout
    socketFactory?: (url: string) => RelaySocket
    tunnelUrl: string
}): { dispose(): void; isReady(): boolean } {
    let disposed = false,
        fatal = false,
        ready = false
    let socket: RelaySocket | null = null,
        peer: RelayPeer | null = null
    let seq = 0,
        reconnectAttempt = 0
    let cancelReconnect: (() => void) | null = null
    let cancelHeartbeat: (() => void) | null = null
    const createSocket = options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as RelaySocket)
    const now = options.now ?? Date.now
    const scheduleInterval = options.scheduleInterval ?? defaultScheduleInterval
    const scheduleTimeout = options.scheduleTimeout ?? defaultScheduleTimeout
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
        clearPeer()
    }

    async function handleOpen(activeSocket: RelaySocket): Promise<void> {
        if (socket !== activeSocket) return
        ready = false
        stopSecureSession()
        clearPeer()
        peer = await createRelayPeer()
        sendLocalKey(activeSocket)
        reconnectAttempt = 0
    }

    function handleClose(activeSocket: RelaySocket, closeInfo?: PairingSocketCloseInfo): void {
        if (socket !== activeSocket) return
        if (ready) {
            ready = false
            options.onClosed()
        }
        stopSecureSession()
        clearPeer()
        if (disposed || options.isDisposed()) return
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
        if (frame.data.kind === 'key') return await handlePeerKey(activeSocket, frame.data.publicKey)
        if (frame.data.kind !== 'sealed') return
        const plainFrame = await tryOpenPairingTunnelPlainFrame(requirePeer().cipher, frame.data)
        if (!plainFrame) return
        if (plainFrame.kind === 'binary') return await handleRelayBinaryChunk(activeSocket, plainFrame)
        if (plainFrame.kind !== 'message') return
        await handlePairingPeerPayload({
            data: JSON.stringify(plainFrame.payload),
            getClient: options.getClient,
            onActive: options.onActive,
            onHeartbeat: (heartbeat) => {
                if (typeof heartbeat.lastSeenSeq === 'number') {
                    options.events?.replayAfter(heartbeat.lastSeenSeq, createRelaySink(activeSocket), reportRelayError)
                }
                return markHeartbeatAck(heartbeat)
            },
            onSendError: reportRelayError,
            sink: createRelaySink(activeSocket),
        })
    }

    async function handlePeerKey(activeSocket: RelaySocket, publicKey: string): Promise<void> {
        const currentPeer = peer ?? (await createRelayPeer())
        peer = currentPeer
        const peerChanged = currentPeer.peerPublicKey !== null && currentPeer.peerPublicKey !== publicKey
        const shouldReply = currentPeer.peerPublicKey !== publicKey
        if (peerChanged) {
            currentPeer.eventStreamDispose?.()
            currentPeer.eventStreamDispose = null
            currentPeer.pendingHeartbeat = null
        }
        currentPeer.peerPublicKey = publicKey
        await currentPeer.cipher.receivePeerKey(publicKey)
        if (shouldReply && activeSocket.readyState === RELAY_SOCKET_OPEN) sendLocalKey(activeSocket)
        if (ready && peerChanged) options.onPeerReplaced?.()
        handleSecureOpen(activeSocket)
    }

    async function handleRelayBinaryChunk(activeSocket: RelaySocket, frame: PairingTunnelBinaryFrame): Promise<void> {
        await handlePairingPeerPayload({
            data: buildPairingRelayUploadFrame(frame),
            getClient: options.getClient,
            onActive: options.onActive,
            onSendError: reportRelayError,
            sink: createRelaySink(activeSocket),
        })
    }

    function handleSecureOpen(activeSocket: RelaySocket): void {
        if (!ready) {
            ready = true
            options.onOpen()
            startHeartbeat()
        }
        startRelayEventStream(activeSocket)
    }

    function stopSecureSession(): void {
        stopEventStream()
        stopHeartbeat()
    }

    function clearPeer(): void {
        peer?.eventStreamDispose?.()
        peer = null
    }

    function requirePeer(): RelayPeer {
        if (!peer) throw new Error('relay tunnel cipher is not ready')
        return peer
    }

    function sendLocalKey(activeSocket: RelaySocket): void {
        activeSocket.send(
            JSON.stringify(
                createPairingTunnelKeyFrame({
                    id: `desktop-key-${now()}`,
                    seq: seq++,
                    publicKey: requirePeer().cipher.publicKey,
                })
            )
        )
    }

    async function sendSealedFrame(activeSocket: RelaySocket, data: string): Promise<void> {
        if (activeSocket.readyState !== RELAY_SOCKET_OPEN) return
        const plainFrame: PairingTunnelPlainFrame = {
            kind: 'message',
            id: `desktop-relay-${now()}-${seq}`,
            seq: seq++,
            payload: PairingPeerMessageSchema.parse(JSON.parse(data) as unknown),
        }
        activeSocket.send(JSON.stringify(await requirePeer().cipher.seal(plainFrame)))
    }

    function createRelaySink(activeSocket: RelaySocket): PairingPeerTextSink {
        return {
            get readyState() {
                return activeSocket.readyState
            },
            send: (data) => void sendSealedFrame(activeSocket, data).catch(reportRelayError),
        }
    }

    function startRelayEventStream(activeSocket: RelaySocket): void {
        if (!peer?.peerPublicKey || !canSendPairingPeerText(createRelaySink(activeSocket))) return
        peer.eventStreamDispose?.()
        peer.eventStreamDispose =
            options.events?.addSink('relay', createRelaySink(activeSocket), reportRelayError) ?? null
    }

    function stopEventStream(): void {
        peer?.eventStreamDispose?.()
        if (peer) peer.eventStreamDispose = null
    }

    function startHeartbeat(): void {
        stopHeartbeat()
        sendHeartbeats()
        cancelHeartbeat = scheduleInterval(sendHeartbeats, PAIRING_PEER_HEARTBEAT_INTERVAL_MS)
    }

    function stopHeartbeat(): void {
        cancelHeartbeat?.()
        cancelHeartbeat = null
        if (peer) peer.pendingHeartbeat = null
    }

    function sendHeartbeats(): void {
        const activeSocket = socket
        const currentTime = now()
        if (!ready || !activeSocket || activeSocket.readyState !== RELAY_SOCKET_OPEN || !peer?.peerPublicKey) return
        if (
            peer.pendingHeartbeat &&
            currentTime - peer.pendingHeartbeat.sentAt >= PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS
        ) {
            ready = false
            clearPeer()
            options.onClosed()
            return
        }
        if (peer.pendingHeartbeat) return
        const heartbeat: PairingPeerHeartbeat = {
            kind: 'heartbeat',
            id: `desktop-relay-${currentTime}-${seq}`,
            protocolVersion: PROTOCOL_VERSION,
            sentAt: currentTime,
        }
        peer.pendingHeartbeat = { id: heartbeat.id ?? '', sentAt: currentTime }
        void sendSealedFrame(activeSocket, JSON.stringify(heartbeat)).catch(reportRelayError)
    }

    function markHeartbeatAck(heartbeat: PairingPeerHeartbeat) {
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
