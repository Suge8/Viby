import {
    classifyFatalPairingClose,
    computePairingReconnectDelay,
    createPairingTunnelCipher,
    createPairingTunnelKeyFrame,
    PairingPeerMessageSchema,
    type PairingTunnelCipher,
    PairingTunnelFrameSchema,
    type PairingTunnelPlainFrame,
    toPairingTunnelBase64Url,
    tryOpenPairingTunnelPlainFrame,
} from '@viby/protocol/pairing'

export interface RemotePairingRelayBinaryChunk {
    transferId: string
    chunkIndex: number
    chunkCount: number
    bytes: Uint8Array
}

export interface RemotePairingRelaySocket {
    readonly readyState: 'closed' | 'open'
    dispose(): void
    notifyForeground(): void
    reconnect(): void
    send(data: string): void
    /**
     * Ship one upload chunk through the sealed tunnel. Mirrors the
     * datachannel binary upload path so the desktop bridge can rebuild the
     * magic header and re-use `PairingBinaryUploadManager`. Resolves after
     * the sealed frame leaves the local socket, not after the peer ack:
     * the upload-complete RPC owns end-to-end acknowledgement.
     */
    sendBinaryChunk(chunk: RemotePairingRelayBinaryChunk): Promise<void>
}

export interface RemotePairingRelayWebSocket {
    readyState: number
    onclose: ((event: { code: number; reason: string }) => void) | null
    onerror: (() => void) | null
    onmessage: ((event: { data: unknown }) => void) | null
    onopen: (() => void) | null
    close(): void
    send(data: string): void
}

type ScheduleTimeout = (callback: () => void, delayMs: number) => () => void

const SOCKET_OPEN = 1

export function createRemotePairingRelaySocket(options: {
    onClose: () => void
    onFatal: (reason: string) => void
    onMessage: (data: string) => void
    onOpen: () => void
    randomJitter?: () => number
    scheduleTimeout?: ScheduleTimeout
    socketFactory?: (url: string) => RemotePairingRelayWebSocket
    tunnelUrl: string
}): RemotePairingRelaySocket {
    let disposed = false
    let fatal = false
    let socket: RemotePairingRelayWebSocket | null = null
    let cipher: PairingTunnelCipher | null = null
    let peerPublicKey: string | null = null
    let seq = 0
    let reconnectAttempt = 0
    let cancelReconnect: (() => void) | null = null
    const createSocket =
        options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as RemotePairingRelayWebSocket)
    const scheduleTimeout = options.scheduleTimeout ?? defaultScheduleTimeout
    const pendingMessages: string[] = []
    let readyState: RemotePairingRelaySocket['readyState'] = 'closed'

    connect()
    return {
        dispose,
        notifyForeground,
        reconnect,
        send,
        sendBinaryChunk,
        get readyState() {
            return readyState
        },
    }

    function connect(): void {
        if (disposed || fatal || socket?.readyState === SOCKET_OPEN) return
        const nextSocket = createSocket(options.tunnelUrl)
        socket = nextSocket
        nextSocket.onopen = () => void handleOpen(nextSocket).catch(closeSocket)
        nextSocket.onmessage = (event) => void handleFrame(event.data).catch(closeSocket)
        nextSocket.onclose = (event) => handleClose(event.code, event.reason)
        nextSocket.onerror = () => nextSocket.close()
    }

    function dispose(): void {
        disposed = true
        clearReconnectTimer()
        socket?.close()
        socket = null
        cipher = null
        peerPublicKey = null
        readyState = 'closed'
    }

    function notifyForeground(): void {
        if (readyState === 'closed') connect()
    }

    function reconnect(): void {
        clearReconnectTimer()
        if (!socket) {
            connect()
            return
        }
        socket.close()
    }

    function send(data: string): void {
        if (socket?.readyState !== SOCKET_OPEN) throw new Error('relay tunnel is closed')
        if (readyState !== 'open') {
            pendingMessages.push(data)
            return
        }
        void sendMessage(socket, data).catch(closeSocket)
    }

    async function sendMessage(activeSocket: RemotePairingRelayWebSocket, data: string): Promise<void> {
        const plainFrame: PairingTunnelPlainFrame = {
            kind: 'message',
            id: `web-relay-${Date.now()}-${seq}`,
            seq: seq++,
            payload: PairingPeerMessageSchema.parse(JSON.parse(data) as unknown),
        }
        activeSocket.send(JSON.stringify(await requireCipher().seal(plainFrame)))
    }

    async function sendBinaryChunk(chunk: RemotePairingRelayBinaryChunk): Promise<void> {
        if (socket?.readyState !== SOCKET_OPEN || readyState !== 'open') {
            throw new Error('relay tunnel is closed')
        }
        const plainFrame: PairingTunnelPlainFrame = {
            kind: 'binary',
            id: `web-relay-binary-${Date.now()}-${seq}`,
            seq: seq++,
            transferId: chunk.transferId,
            chunkIndex: chunk.chunkIndex,
            chunkCount: chunk.chunkCount,
            bytesBase64: toPairingTunnelBase64Url(chunk.bytes),
        }
        socket.send(JSON.stringify(await requireCipher().seal(plainFrame)))
    }

    async function handleOpen(activeSocket: RemotePairingRelayWebSocket | null): Promise<void> {
        if (!activeSocket) return
        readyState = 'closed'
        cipher = await createPairingTunnelCipher()
        peerPublicKey = null
        sendLocalKey(activeSocket)
        reconnectAttempt = 0
    }

    function handleClose(code: number, reason: string): void {
        if (readyState === 'open') {
            readyState = 'closed'
            options.onClose()
        }
        cipher = null
        peerPublicKey = null
        if (disposed) return
        // The broker permanently rejects an invalid token / deleted / expired
        // pairing; reconnecting on those codes storms the broker and starves a
        // fresh scan. Terminal closes are owned by the shared classifier so the
        // desktop bridge and direct `/ws` transport agree on the same rule.
        // Latch `fatal` so a later foreground pulse / reconnect cannot reopen a
        // socket on the dead credential (mirrors the desktop bridge).
        const fatalReason = classifyFatalPairingClose({ code, reason })
        if (fatalReason) {
            fatal = true
            clearReconnectTimer()
            options.onFatal(fatalReason)
            return
        }
        scheduleReconnect()
    }

    async function handleFrame(data: unknown): Promise<void> {
        if (typeof data !== 'string') return
        const frame = PairingTunnelFrameSchema.safeParse(parseJson(data))
        if (!frame.success) return
        if (frame.data.kind === 'key') {
            const activeCipher = requireCipher()
            const shouldReply = peerPublicKey !== frame.data.publicKey
            peerPublicKey = frame.data.publicKey
            await activeCipher.receivePeerKey(frame.data.publicKey)
            if (shouldReply && socket?.readyState === SOCKET_OPEN) sendLocalKey(socket)
            handleSecureOpen()
            return
        }
        if (frame.data.kind !== 'sealed') return
        const plainFrame = await tryOpenPairingTunnelPlainFrame(requireCipher(), frame.data)
        if (!plainFrame) return
        if (plainFrame.kind !== 'message') return
        options.onMessage(JSON.stringify(plainFrame.payload))
    }

    function handleSecureOpen(): void {
        if (readyState === 'open') return
        readyState = 'open'
        options.onOpen()
        while (socket?.readyState === SOCKET_OPEN && pendingMessages.length > 0) {
            const message = pendingMessages.shift()
            if (message) void sendMessage(socket, message).catch(closeSocket)
        }
    }

    function requireCipher(): PairingTunnelCipher {
        if (!cipher) throw new Error('relay tunnel cipher is not ready')
        return cipher
    }

    function sendLocalKey(activeSocket: RemotePairingRelayWebSocket): void {
        activeSocket.send(
            JSON.stringify(
                createPairingTunnelKeyFrame({
                    id: `web-key-${Date.now()}`,
                    seq: seq++,
                    publicKey: requireCipher().publicKey,
                })
            )
        )
    }

    function closeSocket(): void {
        socket?.close()
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
}

function defaultScheduleTimeout(callback: () => void, delayMs: number): () => void {
    const timer = window.setTimeout(callback, delayMs)
    return () => window.clearTimeout(timer)
}

function parseJson(data: string): unknown {
    try {
        return JSON.parse(data) as unknown
    } catch {
        return null
    }
}
