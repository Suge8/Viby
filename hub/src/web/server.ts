import { Hono, type Context, type Next } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { serveStatic } from 'hono/bun'
import { PROTOCOL_VERSION } from '@viby/protocol'
import type { SyncEngine } from '../sync/syncEngine'
import { createAuthMiddleware, type WebAppEnv } from './middleware/auth'
import { createAuthRoutes } from './routes/auth'
import { createSessionsRoutes } from './routes/sessions'
import { createMessagesRoutes } from './routes/messages'
import { createPermissionsRoutes } from './routes/permissions'
import { createMachinesRoutes } from './routes/machines'
import { createGitRoutes } from './routes/git'
import { createCliRoutes } from './routes/cli'
import { createPushRoutes } from './routes/push'
import { createTeamsRoutes } from './routes/teams'
import type { Server as BunServer } from 'bun'
import type { Server as SocketEngine } from '@socket.io/bun-engine'
import type { WebSocketData } from '@socket.io/bun-engine'
import { loadEmbeddedAssetMap, type EmbeddedWebAsset } from './embeddedAssets'
import { isBunCompiled } from '../utils/bunCompiled'
import type { Store } from '../store'

export const API_CORS_ALLOW_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] as const
const API_CORS_ALLOW_HEADERS = ['authorization', 'content-type'] as const

function findWebappDistDir(): { distDir: string; indexHtmlPath: string } {
    const candidates = [
        join(process.cwd(), '..', 'web', 'dist'),
        join(import.meta.dir, '..', '..', '..', 'web', 'dist'),
        join(process.cwd(), 'web', 'dist')
    ]

    for (const distDir of candidates) {
        const indexHtmlPath = join(distDir, 'index.html')
        if (existsSync(indexHtmlPath)) {
            return { distDir, indexHtmlPath }
        }
    }

    const distDir = candidates[0]
    return { distDir, indexHtmlPath: join(distDir, 'index.html') }
}

function serveEmbeddedAsset(asset: EmbeddedWebAsset): Response {
    const cacheControl = getWebAssetCacheControl(asset.path)
    return new Response(Bun.file(asset.sourcePath), {
        headers: {
            'Content-Type': asset.mimeType,
            'Cache-Control': cacheControl
        }
    })
}

function getWebAssetCacheControl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`

    if (normalizedPath === '/' || normalizedPath === '/sw.js' || normalizedPath === '/manifest.webmanifest' || normalizedPath.endsWith('.html')) {
        return 'no-cache, no-store, must-revalidate'
    }

    if (normalizedPath.startsWith('/assets/')) {
        return 'public, max-age=31536000, immutable'
    }

    return 'public, max-age=3600'
}

async function serveStaticWithCacheControl(
    c: Context<WebAppEnv>,
    next: Next,
    options: Parameters<typeof serveStatic<WebAppEnv>>[0],
    cachePath: string
): Promise<Response | void> {
    const response = await serveStatic(options)(c, next)
    if (response instanceof Response) {
        response.headers.set('Cache-Control', getWebAssetCacheControl(cachePath))
    }
    return response
}

export function createApiCorsMiddleware(corsOrigins: readonly string[]): ReturnType<typeof cors> {
    const corsOriginOption = corsOrigins.includes('*') ? '*' : [...corsOrigins]
    return cors({
        origin: corsOriginOption,
        allowMethods: [...API_CORS_ALLOW_METHODS],
        allowHeaders: [...API_CORS_ALLOW_HEADERS]
    })
}

function createWebApp(options: {
    getSyncEngine: () => SyncEngine | null
    jwtSecret: Uint8Array
    store: Store
    vapidPublicKey: string
    corsOrigins?: string[]
    embeddedAssetMap: Map<string, EmbeddedWebAsset> | null
    relayMode?: boolean
    officialWebUrl?: string
}): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.use('*', logger())

    // Health check endpoint (no auth required)
    app.get('/health', (c) => c.json({ status: 'ok', protocolVersion: PROTOCOL_VERSION }))

    const corsMiddleware = createApiCorsMiddleware(options.corsOrigins ?? [])
    app.use('/api/*', corsMiddleware)
    app.use('/cli/*', corsMiddleware)

    app.route('/cli', createCliRoutes(options.getSyncEngine))

    app.route('/api', createAuthRoutes(options.jwtSecret))

    app.use('/api/*', createAuthMiddleware(options.jwtSecret))
    app.route('/api', createSessionsRoutes(options.getSyncEngine))
    app.route('/api', createMessagesRoutes(options.getSyncEngine))
    app.route('/api', createPermissionsRoutes(options.getSyncEngine))
    app.route('/api', createMachinesRoutes(options.getSyncEngine))
    app.route('/api', createGitRoutes(options.getSyncEngine))
    app.route('/api', createTeamsRoutes(options.getSyncEngine))
    app.route('/api', createPushRoutes(options.store, options.vapidPublicKey))

    // Skip static serving in relay mode, show helpful message on root
    if (options.relayMode) {
        const officialUrl = options.officialWebUrl || 'https://app.viby.run'
        app.get('/', (c) => {
            return c.html(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Viby Hub</title></head>
<body style="font-family: system-ui; padding: 2rem; max-width: 600px;">
<h1>Viby Hub</h1>
<p>This hub is running in relay mode. Please use the official Viby web app:</p>
<p><a href="${officialUrl}">${officialUrl}</a></p>
<details>
<summary>Why am I seeing this?</summary>
<p style="margin-top: 0.5rem; color: #666;">
When relay mode is enabled, all traffic flows through our relay infrastructure with end-to-end encryption.
To reduce bandwidth and improve performance, the frontend is served separately
from GitHub Pages instead of through the relay tunnel.
</p>
</details>
</body>
</html>`)
        })
        return app
    }

    if (options.embeddedAssetMap) {
        const embeddedAssetMap = options.embeddedAssetMap
        const indexHtmlAsset = embeddedAssetMap.get('/index.html')

        if (!indexHtmlAsset) {
            app.get('*', (c) => {
                return c.text(
                    'Embedded web app is missing index.html. Rebuild the executable after running bun run build:web.',
                    503
                )
            })
            return app
        }

        app.use('*', async (c, next) => {
            if (c.req.path.startsWith('/api')) {
                return await next()
            }

            if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
                return await next()
            }

            const asset = embeddedAssetMap.get(c.req.path)
            if (asset) {
                return serveEmbeddedAsset(asset)
            }

            return await next()
        })

        app.get('*', async (c, next) => {
            if (c.req.path.startsWith('/api')) {
                await next()
                return
            }

            return serveEmbeddedAsset(indexHtmlAsset)
        })

        return app
    }

    const { distDir, indexHtmlPath } = findWebappDistDir()

    if (!existsSync(indexHtmlPath)) {
        app.get('/', (c) => {
            return c.text(
                'Web app is not built.\n\nRun:\n  cd web\n  bun install\n  bun run build\n',
                503
            )
        })
        return app
    }

    app.use('/assets/*', async (c, next) => {
        return await serveStaticWithCacheControl(c, next, { root: distDir }, c.req.path)
    })

    app.use('*', async (c, next) => {
        if (c.req.path.startsWith('/api')) {
            await next()
            return
        }

        return await serveStaticWithCacheControl(c, next, { root: distDir }, c.req.path)
    })

    app.get('*', async (c, next) => {
        if (c.req.path.startsWith('/api')) {
            await next()
            return
        }

        return await serveStaticWithCacheControl(c, next, { root: distDir, path: 'index.html' }, '/index.html')
    })

    return app
}

export type StartWebServerOptions = {
    getSyncEngine: () => SyncEngine | null
    jwtSecret: Uint8Array
    store: Store
    vapidPublicKey: string
    socketEngine: SocketEngine
    listenHost: string
    listenPort: number
    publicUrl: string
    corsOrigins?: string[]
    relayMode?: boolean
    officialWebUrl?: string
}

export async function createWebServerFetch(
    options: StartWebServerOptions
): Promise<(req: Request, server: BunServer<WebSocketData>) => Response | Promise<Response>> {
    const isCompiled = isBunCompiled()
    const embeddedAssetMap = isCompiled ? await loadEmbeddedAssetMap() : null
    const app = createWebApp({
        getSyncEngine: options.getSyncEngine,
        jwtSecret: options.jwtSecret,
        store: options.store,
        vapidPublicKey: options.vapidPublicKey,
        corsOrigins: options.corsOrigins,
        embeddedAssetMap,
        relayMode: options.relayMode,
        officialWebUrl: options.officialWebUrl
    })

    const socketHandler = options.socketEngine.handler()
    return (req, server) => {
        const url = new URL(req.url)
        if (url.pathname.startsWith('/socket.io/')) {
            return socketHandler.fetch(req, server)
        }
        return app.fetch(req)
    }
}

export async function startWebServer(options: StartWebServerOptions): Promise<BunServer<WebSocketData>> {
    const fetch = await createWebServerFetch(options)
    const socketHandler = options.socketEngine.handler()

    const server = Bun.serve({
        hostname: options.listenHost,
        port: options.listenPort,
        idleTimeout: Math.max(30, socketHandler.idleTimeout),
        maxRequestBodySize: socketHandler.maxRequestBodySize,
        websocket: socketHandler.websocket,
        fetch
    })

    console.log(`[Web] hub listening on ${options.listenHost}:${server.port}`)
    console.log(`[Web] public URL: ${options.publicUrl}`)

    return server
}
