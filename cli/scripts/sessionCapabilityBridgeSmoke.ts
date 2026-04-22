import type { ClientToServerEvents, ServerToClientEvents } from '@viby/protocol'
import { io, type Socket } from 'socket.io-client'
import { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { registerCommonHandlers } from '@/modules/common/registerCommonHandlers'

const SESSION_ID = process.env.VIBY_SMOKE_SESSION_ID
const CLI_API_TOKEN = process.env.CLI_API_TOKEN
const API_URL = process.env.VIBY_API_URL
const WORKING_DIRECTORY = process.env.VIBY_SMOKE_WORKING_DIRECTORY
const KEEPALIVE_INTERVAL_MS = 5_000

function assertEnv(name: string, value: string | undefined): string {
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`)
    }

    return value
}

function emitAlive(socket: Socket<ServerToClientEvents, ClientToServerEvents>, sessionId: string): void {
    socket.emit('session-alive', {
        sid: sessionId,
        time: Date.now(),
        thinking: false,
        mode: 'remote',
    })
}

async function waitForConnect(socket: Socket<ServerToClientEvents, ClientToServerEvents>): Promise<void> {
    if (socket.connected) {
        return
    }

    await new Promise<void>((resolve, reject) => {
        const handleConnect = () => {
            cleanup()
            resolve()
        }
        const handleError = (error: Error) => {
            cleanup()
            reject(error)
        }
        const cleanup = () => {
            socket.off('connect', handleConnect)
            socket.off('connect_error', handleError)
        }

        socket.on('connect', handleConnect)
        socket.on('connect_error', handleError)
    })
}

async function main(): Promise<void> {
    const sessionId = assertEnv('VIBY_SMOKE_SESSION_ID', SESSION_ID)
    const apiUrl = assertEnv('VIBY_API_URL', API_URL)
    const token = assertEnv('CLI_API_TOKEN', CLI_API_TOKEN)
    const workingDirectory = assertEnv('VIBY_SMOKE_WORKING_DIRECTORY', WORKING_DIRECTORY)

    const rpcHandlerManager = new RpcHandlerManager({
        scopePrefix: sessionId,
        logger: () => {},
    })

    let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = io(`${apiUrl}/cli`, {
        auth: {
            token,
            clientType: 'session-scoped' as const,
            sessionId,
        },
        path: '/socket.io/',
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 2_000,
        transports: ['websocket'],
    })

    registerCommonHandlers(rpcHandlerManager, workingDirectory, {
        onCommandCapabilitiesInvalidated: () => {
            socket?.emit('command-capabilities-invalidated', {
                sid: sessionId,
            })
        },
    })

    socket.on('connect', () => {
        rpcHandlerManager.onSocketConnect(socket)
        emitAlive(socket, sessionId)
        console.log(`[smoke] capability bridge connected for ${sessionId}`)
    })

    socket.on('rpc-request', async (data, callback) => {
        callback(await rpcHandlerManager.handleRequest(data))
    })

    socket.on('disconnect', () => {
        rpcHandlerManager.onSocketDisconnect()
    })

    socket.on('connect_error', (error) => {
        console.error(`[smoke] capability bridge connect error: ${error.message}`)
    })

    await waitForConnect(socket)

    const keepAliveTimer = setInterval(() => {
        if (!socket?.connected) {
            return
        }

        emitAlive(socket, sessionId)
    }, KEEPALIVE_INTERVAL_MS)
    keepAliveTimer.unref?.()

    const shutdown = () => {
        clearInterval(keepAliveTimer)
        rpcHandlerManager.onSocketDisconnect()
        socket?.disconnect()
        socket = null
        process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}

await main()
