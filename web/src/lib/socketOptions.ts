const SOCKET_IO_PATH = '/socket.io/'
const SOCKET_RECONNECT_DELAY_MS = 1_000
const SOCKET_RECONNECT_DELAY_MAX_MS = 5_000
const SOCKET_CONNECT_TIMEOUT_MS = 10_000
const SOCKET_TRANSPORTS = ['polling', 'websocket']

type BaseSocketOptions = {
    path: string
    transports: string[]
    reconnection: boolean
    reconnectionAttempts: number
    reconnectionDelay: number
    reconnectionDelayMax: number
    timeout: number
}

function createBaseSocketOptions(): BaseSocketOptions {
    return {
        path: SOCKET_IO_PATH,
        transports: [...SOCKET_TRANSPORTS],
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
