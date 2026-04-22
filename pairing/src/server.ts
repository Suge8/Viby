import { createBunWebSocket } from 'hono/bun'
import { type PairingBrokerConfig, readPairingBrokerConfig } from './config'
import { createPairingApp, type PairingHttpOptions } from './http'
import { PairingMetrics } from './metrics'
import { PairingRateLimiter } from './rateLimit'
import { createConfiguredPairingStore, type PairingStore } from './store'
import { PairingSocketHub } from './ws'

export interface PairingRuntime {
    app: ReturnType<typeof createPairingApp>
    websocket: ReturnType<typeof createBunWebSocket>['websocket']
    store: PairingStore
    socketHub: PairingSocketHub
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
    })
    const { upgradeWebSocket, websocket } = createBunWebSocket()
    const rateLimiter = new PairingRateLimiter()
    const metrics = new PairingMetrics(options.now?.() ?? Date.now())

    const app = createPairingApp({
        store: storeLease.store,
        socketHub,
        publicUrl: options.publicUrl,
        sessionTtlSeconds: options.sessionTtlSeconds,
        ticketTtlSeconds: options.ticketTtlSeconds,
        reconnectChallengeTtlSeconds: options.reconnectChallengeTtlSeconds,
        stunUrls: options.stunUrls,
        turnGenerator: options.turnGenerator,
        createToken: options.createToken,
        upgradeWebSocket,
        logger: options.logger,
        rateLimiter,
        rateLimitRules: {
            create: { bucket: 'create', limit: options.createLimitPerMinute, windowMs: 60_000 },
            claim: { bucket: 'claim', limit: options.claimLimitPerMinute, windowMs: 60_000 },
            reconnect: { bucket: 'reconnect', limit: options.reconnectLimitPerMinute, windowMs: 60_000 },
            approve: { bucket: 'approve', limit: options.approveLimitPerMinute, windowMs: 60_000 },
        },
        metrics,
        now: options.now,
    } satisfies PairingHttpOptions)

    return {
        app,
        websocket,
        store: storeLease.store,
        socketHub,
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
