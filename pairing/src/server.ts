import { PairingBrokerTunnelMessageSchema } from '@viby/protocol/pairing'
import { createBunWebSocket } from 'hono/bun'
import { type PairingBrokerConfig, readPairingBrokerConfig } from './config'
import { createPairingApp, type PairingHttpOptions } from './http'
import { createPairingManifestCookieSigner } from './manifestCookie'
import { PairingMetrics } from './metrics'
import { PairingRateLimiter } from './rateLimit'
import { createConfiguredPairingStore, type PairingStore } from './store'
import { PairingSocketHub } from './ws'
import { shouldBufferPairingTunnelMessage } from './wsBufferPolicy'

// Cookie TTL is intentionally larger than the broker handoff ticket TTL
// because the client warmup owner rotates the cookie at the same 5-minute
// cadence as the ticket; an iOS Safari tab left idle past one rotation
// window still has a valid cookie when the user opens the share sheet.
const PAIRING_MANIFEST_COOKIE_TTL_SECONDS = 30 * 60

export interface PairingRuntime {
    app: ReturnType<typeof createPairingApp>
    websocket: ReturnType<typeof createBunWebSocket>['websocket']
    store: PairingStore
    socketHub: PairingSocketHub
    tunnelHub: PairingSocketHub
    dispose(): Promise<void>
}

export interface CreatePairingRuntimeOptions extends PairingBrokerConfig {
    store?: PairingStore
    now?: () => number
    logger?: Pick<Console, 'debug' | 'error' | 'info' | 'log' | 'warn'>
}

export async function createPairingRuntime(options: CreatePairingRuntimeOptions): Promise<PairingRuntime> {
    const storeLease = options.store
        ? { store: options.store, dispose: async () => {} }
        : await createConfiguredPairingStore({ redisUrl: options.redisUrl, now: options.now })
    const socketHub = new PairingSocketHub({
        store: storeLease.store,
        now: options.now,
        logger: options.logger ?? console,
        disconnectGraceMs: options.disconnectGraceMs,
        bufferMessages: true,
    })
    const tunnelHub = new PairingSocketHub({
        store: storeLease.store,
        now: options.now,
        logger: options.logger ?? console,
        disconnectGraceMs: options.disconnectGraceMs,
        bufferMessages: true,
        maxBufferedMessagesPerRole: 4,
        messageSchema: PairingBrokerTunnelMessageSchema,
        shouldBufferMessage: shouldBufferPairingTunnelMessage,
    })
    const { upgradeWebSocket, websocket } = createBunWebSocket()
    const rateLimiter = new PairingRateLimiter()
    const metrics = new PairingMetrics(options.now?.() ?? Date.now())
    const manifestCookieSigner = createPairingManifestCookieSigner()

    const app = createPairingApp({
        store: storeLease.store,
        socketHub,
        tunnelHub,
        publicUrl: options.publicUrl,
        sessionTtlSeconds: options.sessionTtlSeconds,
        ticketTtlSeconds: options.ticketTtlSeconds,
        reconnectChallengeTtlSeconds: options.reconnectChallengeTtlSeconds,
        stunUrls: options.stunUrls,
        turnUrls: options.turnUrls,
        turnStaticAuthSecret: options.turnStaticAuthSecret,
        turnCredentialTtlSeconds: options.turnCredentialTtlSeconds,
        createToken: options.createToken,
        upgradeWebSocket,
        logger: options.logger ?? console,
        rateLimiter,
        rateLimitRules: {
            create: { bucket: 'create', limit: options.createLimitPerMinute, windowMs: 60_000 },
            claim: { bucket: 'claim', limit: options.claimLimitPerMinute, windowMs: 60_000 },
            reconnect: { bucket: 'reconnect', limit: options.reconnectLimitPerMinute, windowMs: 60_000 },
            approve: { bucket: 'approve', limit: options.approveLimitPerMinute, windowMs: 60_000 },
        },
        metrics,
        now: options.now,
        manifestCookieSigner,
        manifestCookieTtlSeconds: PAIRING_MANIFEST_COOKIE_TTL_SECONDS,
    } satisfies PairingHttpOptions)

    return {
        app,
        websocket,
        store: storeLease.store,
        socketHub,
        tunnelHub,
        dispose: storeLease.dispose,
    }
}

export async function startPairingBroker(options: CreatePairingRuntimeOptions) {
    const runtime = await createPairingRuntime(options)
    const server = Bun.serve({
        hostname: options.host,
        port: options.port,
        fetch: runtime.app.fetch,
        websocket: runtime.websocket,
    })

    return {
        server,
        runtime,
        async stop() {
            server.stop()
            await runtime.dispose()
        },
    }
}

export async function startPairingBrokerFromEnv() {
    return await startPairingBroker(readPairingBrokerConfig())
}
