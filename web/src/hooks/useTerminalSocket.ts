import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { useTranslation } from '@/lib/use-translation'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'
import { useRemotePeerBridge } from '@/remote/remoteBridgeContext'
import { createLocalTerminalSocket, type TerminalConnectionState, type TerminalSize } from './terminalSocketSupport'

type UseTerminalSocketOptions = {
    baseUrl: string
    token: string
    sessionId: string
    terminalId: string
}

export function useTerminalSocket(options: UseTerminalSocketOptions): {
    state: TerminalConnectionState
    connect: (cols: number, rows: number) => void
    write: (data: string) => void
    resize: (cols: number, rows: number) => void
    disconnect: () => void
    onOutput: (handler: (data: string) => void) => void
    onExit: (handler: (code: number | null, signal: string | null) => void) => void
} {
    const [state, setState] = useState<TerminalConnectionState>({ status: 'idle' })
    const { t } = useTranslation()
    const bridge = useRemotePeerBridge()
    const socketRef = useRef<Socket | null>(null)
    const outputHandlerRef = useRef<(data: string) => void>(() => {})
    const exitHandlerRef = useRef<(code: number | null, signal: string | null) => void>(() => {})
    const sessionIdRef = useRef(options.sessionId)
    const terminalIdRef = useRef(options.terminalId)
    const tokenRef = useRef(options.token)
    const baseUrlRef = useRef(options.baseUrl)
    const lastSizeRef = useRef<TerminalSize | null>(null)
    const remoteConnectedRef = useRef(false)

    useEffect(() => {
        sessionIdRef.current = options.sessionId
        terminalIdRef.current = options.terminalId
        baseUrlRef.current = options.baseUrl
    }, [options.sessionId, options.terminalId, options.baseUrl])

    useEffect(() => {
        tokenRef.current = options.token
        const socket = socketRef.current
        if (!socket) {
            return
        }
        if (!options.token) {
            if (socket.connected) {
                socket.disconnect()
            }
            return
        }
        socket.auth = { token: options.token }
        if (socket.connected) {
            socket.disconnect()
            socket.connect()
        }
    }, [options.token])

    const isCurrentTerminal = useCallback((terminalId: string) => terminalId === terminalIdRef.current, [])

    const emitCreate = useCallback((socket: Socket, size: TerminalSize) => {
        socket.emit('terminal:create', {
            sessionId: sessionIdRef.current,
            terminalId: terminalIdRef.current,
            cols: size.cols,
            rows: size.rows,
        })
    }, [])

    const setErrorState = useCallback((message: string) => {
        setState({ status: 'error', error: message })
    }, [])

    const formatTerminalError = useCallback(
        (error: unknown, fallbackKey: string): string =>
            formatUserFacingErrorMessage(error, { t, fallbackKey, allowPassthrough: true }),
        [t]
    )

    const runRemoteTerminalCommand = useCallback(
        (command: Promise<void>) => {
            command.catch((error: unknown) => {
                setErrorState(formatTerminalError(error, 'terminal.error.commandFailed'))
            })
        },
        [formatTerminalError, setErrorState]
    )

    const connect = useCallback(
        (cols: number, rows: number) => {
            lastSizeRef.current = { cols, rows }
            const token = tokenRef.current
            const sessionId = sessionIdRef.current
            const terminalId = terminalIdRef.current

            if (!sessionId || !terminalId || (!token && !bridge)) {
                setErrorState(t('terminal.error.missingCredentials'))
                return
            }

            if (bridge) {
                setState({ status: 'connecting' })
                void bridge
                    .openTerminal({ sessionId, terminalId, cols, rows })
                    .then(() => {
                        remoteConnectedRef.current = true
                        setState({ status: 'connected' })
                    })
                    .catch((error: unknown) => {
                        setErrorState(formatTerminalError(error, 'terminal.error.connection'))
                    })
                return
            }

            if (socketRef.current) {
                const socket = socketRef.current
                socket.auth = { token }
                if (socket.connected) {
                    emitCreate(socket, { cols, rows })
                } else {
                    socket.connect()
                }
                setState({ status: 'connecting' })
                return
            }

            const socket = createLocalTerminalSocket({
                baseUrl: baseUrlRef.current,
                token,
                getSize: () => lastSizeRef.current ?? { cols, rows },
                emitCreate,
                isCurrentTerminal,
                setIdle: () => setState({ status: 'idle' }),
                setConnecting: () => setState({ status: 'connecting' }),
                setConnected: () => setState({ status: 'connected' }),
                setError: setErrorState,
                formatError: formatTerminalError,
                formatDisconnectReason: (reason) => t('terminal.error.disconnected', { reason }),
                terminalExitedMessage: t('terminal.error.exited'),
                handleOutput: (data) => outputHandlerRef.current(data),
                handleExit: (code, signal) => exitHandlerRef.current(code, signal),
            })
            socketRef.current = socket
            setState({ status: 'connecting' })
            socket.connect()
        },
        [bridge, emitCreate, formatTerminalError, setErrorState, isCurrentTerminal, t]
    )

    const write = useCallback(
        (data: string) => {
            if (bridge) {
                if (remoteConnectedRef.current) {
                    runRemoteTerminalCommand(
                        bridge.writeTerminal({
                            sessionId: sessionIdRef.current,
                            terminalId: terminalIdRef.current,
                            data,
                        })
                    )
                }
                return
            }
            const socket = socketRef.current
            if (!socket || !socket.connected) {
                return
            }
            socket.emit('terminal:write', { terminalId: terminalIdRef.current, data })
        },
        [bridge, runRemoteTerminalCommand]
    )

    const resize = useCallback(
        (cols: number, rows: number) => {
            lastSizeRef.current = { cols, rows }
            if (bridge) {
                if (remoteConnectedRef.current) {
                    runRemoteTerminalCommand(
                        bridge.resizeTerminal({
                            sessionId: sessionIdRef.current,
                            terminalId: terminalIdRef.current,
                            cols,
                            rows,
                        })
                    )
                }
                return
            }
            const socket = socketRef.current
            if (!socket || !socket.connected) {
                return
            }
            socket.emit('terminal:resize', { terminalId: terminalIdRef.current, cols, rows })
        },
        [bridge, runRemoteTerminalCommand]
    )

    const disconnect = useCallback(() => {
        if (bridge) {
            if (remoteConnectedRef.current) {
                runRemoteTerminalCommand(
                    bridge.closeTerminal({ sessionId: sessionIdRef.current, terminalId: terminalIdRef.current })
                )
            }
            remoteConnectedRef.current = false
            setState({ status: 'idle' })
            return
        }
        const socket = socketRef.current
        if (!socket) {
            return
        }
        socket.removeAllListeners()
        socket.disconnect()
        socketRef.current = null
        setState({ status: 'idle' })
    }, [bridge, runRemoteTerminalCommand])

    useEffect(() => {
        if (!bridge) {
            return
        }
        return bridge.subscribeTerminal((payload) => {
            if (!isCurrentTerminal(payload.terminalId)) {
                return
            }
            if (payload.type === 'ready') {
                remoteConnectedRef.current = true
                setState({ status: 'connected' })
                return
            }
            if (payload.type === 'output') {
                outputHandlerRef.current(payload.data)
                return
            }
            if (payload.type === 'exit') {
                exitHandlerRef.current(payload.code, payload.signal)
                remoteConnectedRef.current = false
                setErrorState(t('terminal.error.exited'))
                return
            }
            remoteConnectedRef.current = false
            setErrorState(formatTerminalError(new Error(payload.message), 'terminal.error.connection'))
        })
    }, [bridge, formatTerminalError, isCurrentTerminal, setErrorState, t])

    const onOutput = useCallback((handler: (data: string) => void) => {
        outputHandlerRef.current = handler
    }, [])

    const onExit = useCallback((handler: (code: number | null, signal: string | null) => void) => {
        exitHandlerRef.current = handler
    }, [])

    return {
        state,
        connect,
        write,
        resize,
        disconnect,
        onOutput,
        onExit,
    }
}
