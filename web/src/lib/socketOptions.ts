const SOCKET_IO_PATH = '/socket.io/'
const SOCKET_RECONNECT_DELAY_MS = 1_000
const SOCKET_RECONNECT_DELAY_MAX_MS = 5_000
const SOCKET_CONNECT_TIMEOUT_MS = 10_000
const SOCKET_TRANSPORTS = ['websocket', 'polling']

type BaseSocketOptions = {
    autoConnect?: false
    path: string
    rememberUpgrade: boolean
    reconnection: boolean
    reconnectionAttempts: number
    reconnectionDelay: number
    reconnectionDelayMax: number
    timeout: number
    transports: string[]
    tryAllTransports: boolean
}

function shouldRememberSocketUpgrade(): boolean {
    if (typeof window === 'undefined') {
        return false
    }

    return window.location.protocol === 'https:'
}

function createBaseSocketOptions(): BaseSocketOptions {
    return {
        path: SOCKET_IO_PATH,
        rememberUpgrade: shouldRememberSocketUpgrade(),
        transports: [...SOCKET_TRANSPORTS],
        tryAllTransports: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: SOCKET_RECONNECT_DELAY_MS,
        reconnectionDelayMax: SOCKET_RECONNECT_DELAY_MAX_MS,
        timeout: SOCKET_CONNECT_TIMEOUT_MS,
    }
}

export function createRealtimeSocketOptions(): BaseSocketOptions {
    return createBaseSocketOptions()
}

export function createLazyRealtimeSocketOptions(): BaseSocketOptions & { autoConnect: false } {
    return {
        ...createBaseSocketOptions(),
        autoConnect: false,
    }
}
