import {
    computePairingReconnectDelay,
    createPairingTunnelCipher,
    createPairingTunnelKeyFrame,
    PairingPeerMessageSchema,
    type PairingTunnelCipher,
    PairingTunnelFrameSchema,
    type PairingTunnelPlainFrame,
} from '@viby/protocol/pairing'

export interface RemotePairingRelaySocket {
    readonly readyState: 'closed' | 'open'
    dispose(): void
    notifyForeground(): void
    send(data: string): void
}

export function createRemotePairingRelaySocket(options: {
    onClose: () => void
    onFatal: (reason: string) => void
    onMessage: (data: string) => void
    onOpen: () => void
    tunnelUrl: string
}): RemotePairingRelaySocket {
    let disposed = false
    let socket: WebSocket | null = null
    let cipher: PairingTunnelCipher | null = null
    let peerPublicKey: string | null = null
    let seq = 0
    let reconnectAttempt = 0
    let reconnectTimer: number | null = null
    const pendingMessages: string[] = []
    let readyState: RemotePairingRelaySocket['readyState'] = 'closed'

    connect()
    return {
        dispose,
        notifyForeground,
        send,
        get readyState() {
            return readyState
        },
    }

    function connect(): void {
        if (disposed || socket?.readyState === WebSocket.OPEN) return
        socket = new WebSocket(options.tunnelUrl)
        socket.onopen = () => void handleOpen(socket).catch(closeSocket)
        socket.onmessage = (event) => void handleFrame(event.data).catch(closeSocket)
        socket.onclose = (event) => handleClose(event.code, event.reason)
        socket.onerror = () => socket?.close()
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

    function send(data: string): void {
        if (socket?.readyState !== WebSocket.OPEN) throw new Error('relay tunnel is closed')
        if (readyState !== 'open') {
            pendingMessages.push(data)
            return
        }
        void sendMessage(socket, data).catch(closeSocket)
    }

    async function sendMessage(activeSocket: WebSocket, data: string): Promise<void> {
        const plainFrame: PairingTunnelPlainFrame = {
            kind: 'message',
            id: `web-relay-${Date.now()}-${seq}`,
            seq: seq++,
            payload: PairingPeerMessageSchema.parse(JSON.parse(data) as unknown),
        }
        activeSocket.send(JSON.stringify(await requireCipher().seal(plainFrame)))
    }

    async function handleOpen(activeSocket: WebSocket | null): Promise<void> {
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
        if (code === 1008) {
            options.onFatal(reason || 'invalid_token')
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
            if (shouldReply && socket?.readyState === WebSocket.OPEN) sendLocalKey(socket)
            handleSecureOpen()
            return
        }
        if (frame.data.kind !== 'sealed') return
        const plainFrame = await requireCipher().open(frame.data)
        if (plainFrame.kind !== 'message') return
        options.onMessage(JSON.stringify(plainFrame.payload))
    }

    function handleSecureOpen(): void {
        if (readyState === 'open') return
        readyState = 'open'
        options.onOpen()
        while (socket?.readyState === WebSocket.OPEN && pendingMessages.length > 0) {
            const message = pendingMessages.shift()
            if (message) void sendMessage(socket, message).catch(closeSocket)
        }
    }

    function requireCipher(): PairingTunnelCipher {
        if (!cipher) throw new Error('relay tunnel cipher is not ready')
        return cipher
    }

    function sendLocalKey(activeSocket: WebSocket): void {
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
        reconnectTimer = window.setTimeout(connect, computePairingReconnectDelay(reconnectAttempt))
    }

    function clearReconnectTimer(): void {
        if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
        reconnectTimer = null
    }
}

function parseJson(data: string): unknown {
    try {
        return JSON.parse(data) as unknown
    } catch {
        return null
    }
}
