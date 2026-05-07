import { SIGNAL_PING_INTERVAL_MS, SIGNAL_RECONNECT_DELAY_MS } from './remotePairingSignal'

type SignalTimerOptions = {
    openSignalSocket: () => void
    sendPing: () => void
    shouldReconnect: () => boolean
}

export function createRemotePairingSignalTimers(options: SignalTimerOptions) {
    let reconnectTimer: number | null = null
    let pingTimer: number | null = null

    function clearReconnect(): void {
        if (reconnectTimer === null) return
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
    }

    function clearPing(): void {
        if (pingTimer === null) return
        window.clearInterval(pingTimer)
        pingTimer = null
    }

    function clear(): void {
        clearReconnect()
        clearPing()
    }

    function startPing(): void {
        clearPing()
        pingTimer = window.setInterval(options.sendPing, SIGNAL_PING_INTERVAL_MS)
    }

    function scheduleReconnect(): void {
        if (!options.shouldReconnect() || reconnectTimer !== null) return
        reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null
            options.openSignalSocket()
        }, SIGNAL_RECONNECT_DELAY_MS)
    }

    return { clear, clearPing, clearReconnect, scheduleReconnect, startPing }
}
