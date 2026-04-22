import { Server as Engine } from '@socket.io/bun-engine'
import { jwtVerify } from 'jose'
import { type DefaultEventsMap, Server } from 'socket.io'
import { z } from 'zod'
import { configuration } from '../configuration'
import { isLoopbackOrigin } from '../hubHelpers'
import type { Store } from '../store'
import { SessionStreamManager } from '../sync/sessionStreamManager'
import type { SyncEvent } from '../sync/syncEngine'
import { parseAccessToken } from '../utils/accessToken'
import { constantTimeEquals } from '../utils/crypto'
import { registerCliHandlers } from './handlers/cli'
import { registerTerminalHandlers } from './handlers/terminal'
import { registerWebHandlers } from './handlers/web'
import { RpcRegistry } from './rpcRegistry'
import type { CliSocketWithData, SocketData, SocketServer } from './socketTypes'
import { TerminalRegistry } from './terminalRegistry'
import { WebRealtimeManager } from './webRealtimeManager'

const jwtPayloadSchema = z.object({
    uid: z.number(),
})

const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60_000
const DEFAULT_MAX_TERMINALS = 4
const DEFAULT_PING_INTERVAL_MS = 25_000
const DEFAULT_PING_TIMEOUT_MS = 20_000
export const SOCKET_CONNECTION_RECOVERY_WINDOW_MS = 10 * 60_000
export const SOCKET_CONNECTION_RECOVERY_SKIP_MIDDLEWARES = true
export const SOCKET_PING_INTERVAL_MS = resolveEnvNumber('VIBY_SOCKET_PING_INTERVAL_MS', DEFAULT_PING_INTERVAL_MS)
export const SOCKET_PING_TIMEOUT_MS = resolveEnvNumber('VIBY_SOCKET_PING_TIMEOUT_MS', DEFAULT_PING_TIMEOUT_MS)

function resolveEnvNumber(name: string, fallback: number): number {
    const raw = process.env[name]
    if (!raw) {
        return fallback
    }
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export type SocketServerDeps = {
    store: Store
    jwtSecret: Uint8Array
    corsOrigins?: string[]
    getSession?: (sessionId: string) => { active: boolean } | null
    onWebappEvent?: (event: SyncEvent) => void
    onSessionAlive?: (payload: { sid: string; time: number; thinking?: boolean; mode?: 'local' | 'remote' }) => void
    onSessionEnd?: (payload: { sid: string; time: number }) => void
    onMachineAlive?: (payload: { machineId: string; time: number }) => void
}

function resolveRequestHost(headers: Headers): string | null {
    const forwardedHost = headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    if (forwardedHost) {
        return forwardedHost
    }

    const host = headers.get('host')?.trim()
    return host || null
}

function normalizeAuthority(value: string): string | null {
    const trimmed = value.trim()
    if (!trimmed) {
        return null
    }

    try {
        return new URL(trimmed).host.toLowerCase()
    } catch {
        return trimmed.toLowerCase()
    }
}

function isSameOriginRequest(origin: string, requestHost: string | null): boolean {
    const normalizedOrigin = normalizeAuthority(origin)
    const normalizedRequestHost = requestHost ? normalizeAuthority(requestHost) : null
    if (!normalizedOrigin || !normalizedRequestHost) {
        return false
    }

    return normalizedOrigin === normalizedRequestHost
}

export function isAllowedSocketOrigin(options: {
    origin: string | null
    corsOrigins: string[]
    requestHost?: string | null
}): boolean {
    if (!options.origin) {
        return true
    }

    if (isSameOriginRequest(options.origin, options.requestHost ?? null)) {
        return true
    }

    if (options.corsOrigins.includes('*') || options.corsOrigins.includes(options.origin)) {
        return true
    }

    const allowLoopbackOrigins = options.corsOrigins.some(isLoopbackOrigin)
    return allowLoopbackOrigins && isLoopbackOrigin(options.origin)
}

export function createSocketServer(deps: SocketServerDeps): {
    io: SocketServer
    engine: Engine
    rpcRegistry: RpcRegistry
    webRealtimeManager: WebRealtimeManager
} {
    const corsOrigins = deps.corsOrigins ?? configuration.corsOrigins
    const allowAllOrigins = corsOrigins.includes('*')
    const corsOriginOption = allowAllOrigins ? '*' : corsOrigins
    const corsOptions = {
        origin: corsOriginOption,
        methods: ['GET', 'POST'],
        credentials: false,
    }

    const io = new Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>({
        cors: corsOptions,
        pingInterval: SOCKET_PING_INTERVAL_MS,
        pingTimeout: SOCKET_PING_TIMEOUT_MS,
        connectionStateRecovery: {
            maxDisconnectionDuration: SOCKET_CONNECTION_RECOVERY_WINDOW_MS,
            skipMiddlewares: SOCKET_CONNECTION_RECOVERY_SKIP_MIDDLEWARES,
        },
    })

    const engine = new Engine({
        path: '/socket.io/',
        cors: corsOptions,
        pingInterval: SOCKET_PING_INTERVAL_MS,
        pingTimeout: SOCKET_PING_TIMEOUT_MS,
        allowRequest: async (req) => {
            if (
                isAllowedSocketOrigin({
                    origin: req.headers.get('origin'),
                    corsOrigins,
                    requestHost: resolveRequestHost(req.headers),
                })
            ) {
                return
            }
            throw 'Origin not allowed'
        },
    })
    io.bind(engine)

    const rpcRegistry = new RpcRegistry()
    const idleTimeoutMs = resolveEnvNumber('VIBY_TERMINAL_IDLE_TIMEOUT_MS', DEFAULT_IDLE_TIMEOUT_MS)
    const maxTerminals = resolveEnvNumber('VIBY_TERMINAL_MAX_TERMINALS', DEFAULT_MAX_TERMINALS)
    const maxTerminalsPerSocket = maxTerminals
    const maxTerminalsPerSession = maxTerminals
    const cliNs = io.of('/cli')
    const terminalNs = io.of('/terminal')
    const webNs = io.of('/web')
    const sessionStreamManager = new SessionStreamManager()
    const terminalRegistry = new TerminalRegistry({
        idleTimeoutMs,
        onIdle: (entry) => {
            const terminalSocket = terminalNs.sockets.get(entry.socketId)
            terminalSocket?.emit('terminal:error', {
                terminalId: entry.terminalId,
                message: 'Terminal closed due to inactivity.',
            })
            const cliSocket = cliNs.sockets.get(entry.cliSocketId)
            cliSocket?.emit('terminal:close', {
                sessionId: entry.sessionId,
                terminalId: entry.terminalId,
            })
        },
    })

    cliNs.use((socket, next) => {
        const auth = socket.handshake.auth as Record<string, unknown> | undefined
        const token = typeof auth?.token === 'string' ? auth.token : null
        const parsedToken = token ? parseAccessToken(token) : null
        if (!parsedToken || !constantTimeEquals(parsedToken, configuration.cliApiToken)) {
            return next(new Error('Invalid token'))
        }
        next()
    })
    cliNs.on('connection', (socket) =>
        registerCliHandlers(socket as CliSocketWithData, {
            io,
            store: deps.store,
            rpcRegistry,
            terminalRegistry,
            sessionStreamManager,
            onSessionAlive: deps.onSessionAlive,
            onSessionEnd: deps.onSessionEnd,
            onMachineAlive: deps.onMachineAlive,
            onWebappEvent: deps.onWebappEvent,
        })
    )

    const authenticateJwtSocket = async (
        socket: Parameters<typeof terminalNs.use>[0] extends (socket: infer T, next: infer _N) => unknown ? T : never,
        next: (error?: Error) => void
    ) => {
        const auth = socket.handshake.auth as Record<string, unknown> | undefined
        const token = typeof auth?.token === 'string' ? auth.token : null
        if (!token) {
            return next(new Error('Missing token'))
        }

        try {
            const verified = await jwtVerify(token, deps.jwtSecret, { algorithms: ['HS256'] })
            const parsed = jwtPayloadSchema.safeParse(verified.payload)
            if (!parsed.success) {
                return next(new Error('Invalid token payload'))
            }
            socket.data.userId = parsed.data.uid
            next()
            return
        } catch {
            return next(new Error('Invalid token'))
        }
    }

    terminalNs.use(authenticateJwtSocket)
    terminalNs.on('connection', (socket) =>
        registerTerminalHandlers(socket, {
            io,
            getSession: (sessionId) => {
                return deps.getSession?.(sessionId) ?? deps.store.sessions.getSession(sessionId)
            },
            terminalRegistry,
            maxTerminalsPerSocket,
            maxTerminalsPerSession,
        })
    )

    const webRealtimeManager = new WebRealtimeManager(webNs, (sessionId) => sessionStreamManager.getStream(sessionId))
    webNs.use(authenticateJwtSocket)
    webNs.on('connection', (socket) =>
        registerWebHandlers(socket, {
            realtimeManager: webRealtimeManager,
        })
    )

    return { io, engine, rpcRegistry, webRealtimeManager }
}
