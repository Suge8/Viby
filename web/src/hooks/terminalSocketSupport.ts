import { Manager, type Socket } from 'socket.io-client'
import { createLazyRealtimeSocketOptions } from '@/lib/socketOptions'

export type TerminalConnectionState =
    | { status: 'idle' }
    | { status: 'connecting' }
    | { status: 'connected' }
    | { status: 'error'; error: string }

export type TerminalSize = {
    cols: number
    rows: number
}

type TerminalReadyPayload = {
    terminalId: string
}

type TerminalOutputPayload = {
    terminalId: string
    data: string
}

type TerminalExitPayload = {
    terminalId: string
    code: number | null
    signal: string | null
}

type TerminalErrorPayload = {
    terminalId: string
    message: string
}

export type LocalTerminalSocketOptions = {
    baseUrl: string
    token: string
    getSize: () => TerminalSize
    emitCreate: (socket: Socket, size: TerminalSize) => void
    isCurrentTerminal: (terminalId: string) => boolean
    setIdle: () => void
    setConnecting: () => void
    setConnected: () => void
    setError: (message: string) => void
    formatError: (error: unknown, fallbackKey: string) => string
    formatDisconnectReason: (reason: string) => string
    terminalExitedMessage: string
    handleOutput: (data: string) => void
    handleExit: (code: number | null, signal: string | null) => void
}

export function createLocalTerminalSocket(options: LocalTerminalSocketOptions): Socket {
    const manager = new Manager(options.baseUrl, createLazyRealtimeSocketOptions())
    const socket = manager.socket('/terminal', { auth: { token: options.token } })

    socket.on('connect', () => {
        options.setConnecting()
        options.emitCreate(socket, options.getSize())
    })
    socket.on('terminal:ready', (payload: TerminalReadyPayload) => {
        if (options.isCurrentTerminal(payload.terminalId)) {
            options.setConnected()
        }
    })
    socket.on('terminal:output', (payload: TerminalOutputPayload) => {
        if (options.isCurrentTerminal(payload.terminalId)) {
            options.handleOutput(payload.data)
        }
    })
    socket.on('terminal:exit', (payload: TerminalExitPayload) => {
        if (options.isCurrentTerminal(payload.terminalId)) {
            options.handleExit(payload.code, payload.signal)
            options.setError(options.terminalExitedMessage)
        }
    })
    socket.on('terminal:error', (payload: TerminalErrorPayload) => {
        if (options.isCurrentTerminal(payload.terminalId)) {
            options.setError(options.formatError(new Error(payload.message), 'terminal.error.connection'))
        }
    })
    socket.on('connect_error', (error) => {
        options.setError(options.formatError(error, 'terminal.error.connection'))
    })
    socket.on('disconnect', (reason) => {
        if (reason === 'io client disconnect') {
            options.setIdle()
            return
        }
        options.setError(options.formatDisconnectReason(reason))
    })

    return socket
}
