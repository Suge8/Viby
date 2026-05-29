import type { Server as SocketEngine, WebSocketData } from '@socket.io/bun-engine'
import { PROTOCOL_VERSION, SESSION_ATTACHMENT_MAX_UPLOAD_BYTES } from '@viby/protocol'
import type { SessionStreamState } from '@viby/protocol/types'
import type { Server as BunServer } from 'bun'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { getOrCreateOwnerId } from '../config/ownerId'
import { createPairingBrokerClient } from '../pairing/client'
import { LanPairingSessionStore } from '../pairing/lanSessionStore'
import type { Store } from '../store'
import type { SyncEngine } from '../sync/syncEngine'
import { isBunCompiled } from '../utils/bunCompiled'
import { type EmbeddedWebAsset, loadEmbeddedAssetMap } from './embeddedAssets'
import { createAuthMiddleware, type WebAppEnv } from './middleware/auth'
import { createPublicAccessDisabledResponse, isAllowedByPublicAccessPolicy } from './publicAccessPolicy'
import { createAuthRoutes } from './routes/auth'
import { createCliRoutes } from './routes/cli'
import { createDeviceAuthRoutes } from './routes/deviceAuth'
import { createGitRoutes } from './routes/git'
import { createLanPairingHostRoutes, createLanPairingPublicRoutes } from './routes/lanPairing'
import { createMessagesRoutes } from './routes/messages'
import { createPairingRoutes } from './routes/pairing'
import { createPermissionsRoutes } from './routes/permissions'
import { createPushRoutes } from './routes/push'
import { createRuntimeRoutes } from './routes/runtime'
import { createSessionsRoutes } from './routes/sessions'
import { registerWebAssetRoutes } from './staticWebAssets'

export const API_CORS_ALLOW_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] as const
const API_CORS_ALLOW_HEADERS = ['authorization', 'content-type'] as const

export function createApiCorsMiddleware(corsOrigins: readonly string[]): ReturnType<typeof cors> {
    const corsOriginOption = corsOrigins.includes('*') ? '*' : [...corsOrigins]
    return cors({
        origin: corsOriginOption,
        allowMethods: [...API_CORS_ALLOW_METHODS],
        allowHeaders: [...API_CORS_ALLOW_HEADERS],
    })
}

function createWebApp(options: {
    getSyncEngine: () => SyncEngine | null
    getSessionStream?: (sessionId: string) => SessionStreamState | null
    jwtSecret: Uint8Array
    store: Store
    vapidPublicKey: string
    corsOrigins?: string[]
    isPublicAccessEnabled: () => boolean
    embeddedAssetMap: Map<string, EmbeddedWebAsset> | null
    getActiveDeviceIds?: () => Set<string>
}): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.use('*', logger())

    const corsMiddleware = createApiCorsMiddleware(options.corsOrigins ?? [])
    app.use('/health', corsMiddleware)

    // Health check endpoint (no auth required)
    app.get('/health', (c) => c.json({ status: 'ok', protocolVersion: PROTOCOL_VERSION }))

    app.use('*', async (c, next) => {
        if (!isAllowedByPublicAccessPolicy(c.req.raw, options.isPublicAccessEnabled())) {
            return createPublicAccessDisabledResponse()
        }
        return await next()
    })

    app.use('/api/*', corsMiddleware)
    app.use('/cli/*', corsMiddleware)

    app.route('/cli', createCliRoutes(options.getSyncEngine))

    const lanPairingSessions = new LanPairingSessionStore()
    const lanPairingOptions = {
        sessions: lanPairingSessions,
        devices: options.store.devices,
        jwtSecret: options.jwtSecret,
        getOwnerId: getOrCreateOwnerId,
    }

    app.route('/api', createAuthRoutes(options.jwtSecret, options.store.devices))
    app.route('/api', createDeviceAuthRoutes(options.jwtSecret, options.store.devices))
    app.route('/api', createLanPairingPublicRoutes(lanPairingOptions))

    app.use('/api/*', createAuthMiddleware(options.jwtSecret))
    app.route('/api', createSessionsRoutes(options.getSyncEngine, options.getSessionStream))
    app.route('/api', createMessagesRoutes(options.getSyncEngine))
    app.route('/api', createPermissionsRoutes(options.getSyncEngine))
    app.route('/api', createRuntimeRoutes(options.getSyncEngine))
    app.route('/api', createGitRoutes(options.getSyncEngine))
    app.route(
        '/api',
        createPairingRoutes(createPairingBrokerClient(), options.getSyncEngine, options.isPublicAccessEnabled)
    )
    app.route('/api', createLanPairingHostRoutes(lanPairingOptions))
    app.route(
        '/api',
        createDeviceAuthRoutes(options.jwtSecret, options.store.devices, {
            protectedRoutes: true,
            getActiveDeviceIds: options.getActiveDeviceIds,
        })
    )
    app.route('/api', createPushRoutes(options.store, options.vapidPublicKey))

    registerWebAssetRoutes(app, options.embeddedAssetMap)
    return app
}

export type StartWebServerOptions = {
    getSyncEngine: () => SyncEngine | null
    getSessionStream?: (sessionId: string) => SessionStreamState | null
    jwtSecret: Uint8Array
    store: Store
    vapidPublicKey: string
    socketEngine: SocketEngine
    listenHost: string
    listenPort: number
    publicUrl: string
    isPublicAccessEnabled: () => boolean
    corsOrigins?: string[]
    getActiveDeviceIds?: () => Set<string>
}

export async function createWebServerFetch(
    options: StartWebServerOptions
): Promise<(req: Request, server: BunServer<WebSocketData>) => Response | Promise<Response>> {
    const isCompiled = isBunCompiled()
    const embeddedAssetMap = isCompiled ? await loadEmbeddedAssetMap() : null
    const app = createWebApp({
        getSyncEngine: options.getSyncEngine,
        getSessionStream: options.getSessionStream,
        jwtSecret: options.jwtSecret,
        store: options.store,
        vapidPublicKey: options.vapidPublicKey,
        corsOrigins: options.corsOrigins,
        isPublicAccessEnabled: options.isPublicAccessEnabled,
        embeddedAssetMap,
        getActiveDeviceIds: options.getActiveDeviceIds,
    })

    const socketHandler = options.socketEngine.handler()
    return (req, server) => {
        const url = new URL(req.url)
        if (url.pathname.startsWith('/socket.io/')) {
            if (!isAllowedByPublicAccessPolicy(req, options.isPublicAccessEnabled())) {
                return createPublicAccessDisabledResponse()
            }
            return socketHandler.fetch(req, server)
        }
        return app.fetch(req)
    }
}

// Multipart upload needs headroom for form-field boundaries, file metadata,
// and the `mimeType` field on top of the binary payload. 256 KiB is the
// observed steady-state ceiling for `parseMultipartUploadBody` and matches
// the value already approved by `hub/src/web/routes/sessionUploadRouteSupport.ts`.
const HTTP_MULTIPART_OVERHEAD_BYTES = 256 * 1024

/**
 * Reconciles the socket.io `maxRequestBodySize` (which the engine ties to
 * `maxHttpBufferSize`, defaulting to 1 MB to cap one WebSocket frame) with
 * the hub's attachment upload ceiling. Adopting the socket.io value verbatim
 * for the shared `Bun.serve` made every multipart upload over 1 MB respond
 * with 413; composer paste and mobile screenshots are routinely 1–5 MB and
 * the attachment surface advertises `SESSION_ATTACHMENT_MAX_UPLOAD_BYTES`
 * as the real product limit. The HTTP body cap must always be at least the
 * attachment ceiling plus multipart overhead while never shrinking below
 * whatever the socket engine itself negotiated.
 */
export function resolveWebServerMaxRequestBodySize(socketMaxRequestBodySize: number): number {
    return Math.max(socketMaxRequestBodySize, SESSION_ATTACHMENT_MAX_UPLOAD_BYTES + HTTP_MULTIPART_OVERHEAD_BYTES)
}

export async function startWebServer(options: StartWebServerOptions): Promise<BunServer<WebSocketData>> {
    const fetch = await createWebServerFetch(options)
    const socketHandler = options.socketEngine.handler()

    const server = Bun.serve({
        hostname: options.listenHost,
        port: options.listenPort,
        idleTimeout: Math.max(30, socketHandler.idleTimeout),
        maxRequestBodySize: resolveWebServerMaxRequestBodySize(socketHandler.maxRequestBodySize),
        websocket: socketHandler.websocket,
        fetch,
    })

    console.log(`[Web] hub listening on ${options.listenHost}:${server.port}`)
    console.log(`[Web] public URL: ${options.publicUrl}`)

    return server
}
