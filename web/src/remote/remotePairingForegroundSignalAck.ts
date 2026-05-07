import { PAIRING_SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS } from '@viby/protocol'

type ForegroundSignalAckOptions = {
    getSocket: () => WebSocket | null
    replaceSocket: (socket: WebSocket) => void
}

export function createRemoteForegroundSignalAck(options: ForegroundSignalAckOptions) {
    let timer: number | null = null

    function clear(): void {
        if (timer !== null) window.clearTimeout(timer)
        timer = null
    }

    function arm(socket: WebSocket): void {
        clear()
        timer = window.setTimeout(() => {
            timer = null
            if (options.getSocket() !== socket || socket.readyState !== WebSocket.OPEN) return
            options.replaceSocket(socket)
        }, PAIRING_SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS)
    }

    return { arm, clear }
}
