import type { Server as BunServer } from 'bun'
import type { WebSocketData } from '@socket.io/bun-engine'
import { createConfiguration } from '../configuration'
import { getOrCreateJwtSecret } from '../config/jwtSecret'
import { findAvailablePort, isAddressInUseError, persistResolvedListenPort } from '../config/runtimeServerBinding'
import { getOrCreateVapidKeys } from '../config/vapidKeys'
import {
    buildStartupMessage,
    formatSource,
    mergeCorsOrigins,
    normalizeOrigins,
    resolveLocalApiUrl,
    resolveRelayFlag
} from '../hubHelpers'
import { PushService } from '../push/pushService'
import { PushNotificationChannel } from '../push/pushNotificationChannel'
import { createSocketServer } from '../socket/server'
import { Store } from '../store'
import { createHubRuntimeStatusWriter, type HubRuntimeStatusWriter } from '../runtimeStatus'
import { createWebServerFetch, startWebServer, type StartWebServerOptions } from '../web/server'
import { createHubRuntimeAccessor } from './accessor'
import { createHubRuntimeCore } from './core'
import { createManagedRunnerController } from './managedRunner'
import { createHubRuntimeHost, type HubRuntimeHost } from './runtimeHost'

export type HubShutdownOptions = {
    exitCode?: number
    logMessage?: string
    statusMessage?: string
    statusPhase?: 'stopped' | 'error'
}

export type HubProcessController = {
    start(): Promise<void>
    reloadRuntime(): Promise<void>
    shutdown(options?: HubShutdownOptions): Promise<number>
}

type HubProcessControllerOptions = {
    relayApiDomain?: string
    officialWebUrl?: string
}

export function createHubProcessController(
    options: HubProcessControllerOptions = {}
): HubProcessController {
    const relayApiDomain = options.relayApiDomain ?? process.env.VIBY_RELAY_API ?? 'relay.viby.run'
    const officialWebUrl = options.officialWebUrl ?? process.env.VIBY_OFFICIAL_WEB_URL ?? 'https://app.viby.run'
    const relayFlag = resolveRelayFlag(process.argv)
    const launchSource = process.env.VIBY_LAUNCH_SOURCE === 'desktop' ? 'desktop' : 'cli'
    const runtimeAccessor = createHubRuntimeAccessor()

    let config: Awaited<ReturnType<typeof createConfiguration>> | null = null
    let runtimeListenPort = 0
    let runtimePublicUrl = ''
    let localHubUrl = ''
    let portFallbackMessage: string | null = null
    let corsOrigins: string[] = []

    let store: Store | null = null
    let jwtSecret: Uint8Array | null = null
    let vapidPublicKey: string | null = null
    let pushService: PushService | null = null
    let socketServer: ReturnType<typeof createSocketServer> | null = null
    let webServer: BunServer<WebSocketData> | null = null
    let activeRuntimeStatus: HubRuntimeStatusWriter | null = null
    let runtimeHost: HubRuntimeHost | null = null
    let shutdownPromise: Promise<number> | null = null
    let shuttingDown = false
    let started = false

    function getConfig(): NonNullable<typeof config> {
        if (!config) {
            throw new Error('Hub configuration is not initialized.')
        }
        return config
    }

    function getStore(): Store {
        if (!store) {
            throw new Error('Hub store is not initialized.')
        }
        return store
    }

    function getJwtSecret(): Uint8Array {
        if (!jwtSecret) {
            throw new Error('Hub JWT secret is not initialized.')
        }
        return jwtSecret
    }

    function getVapidPublicKey(): string {
        if (!vapidPublicKey) {
            throw new Error('Hub VAPID public key is not initialized.')
        }
        return vapidPublicKey
    }

    function getPushService(): PushService {
        if (!pushService) {
            throw new Error('Hub push service is not initialized.')
        }
        return pushService
    }

    function getSocketServer(): NonNullable<typeof socketServer> {
        if (!socketServer) {
            throw new Error('Hub socket server is not initialized.')
        }
        return socketServer
    }

    function joinRuntimeStatusMessage(parts: ReadonlyArray<string | null | undefined>): string {
        return parts.filter((part): part is string => Boolean(part)).join(' ')
    }

    function buildStartingStatusMessage(message: string): string {
        return joinRuntimeStatusMessage([message, portFallbackMessage])
    }

    function buildReadyStatusMessage(overrides?: ReadonlyArray<string | null>): string {
        return joinRuntimeStatusMessage(overrides ?? ['中枢已准备就绪。', portFallbackMessage])
    }

    function buildWebServerOptions(): StartWebServerOptions {
        const currentStore = getStore()
        const currentSocketServer = getSocketServer()

        return {
            getSyncEngine: () => runtimeAccessor.getSyncEngine(),
            jwtSecret: getJwtSecret(),
            store: currentStore,
            vapidPublicKey: getVapidPublicKey(),
            socketEngine: currentSocketServer.engine,
            listenHost: getConfig().listenHost,
            listenPort: runtimeListenPort,
            publicUrl: runtimePublicUrl,
            corsOrigins,
            relayMode: relayFlag.enabled,
            officialWebUrl
        }
    }

    async function initializeProcess(): Promise<void> {
        if (config) {
            return
        }

        console.log('viby hub starting...')
        config = await createConfiguration()
        runtimeListenPort = config.listenPort
        runtimePublicUrl = config.publicUrl
        localHubUrl = resolveLocalApiUrl(config.listenHost, runtimeListenPort)

        const baseCorsOrigins = normalizeOrigins(config.corsOrigins)
        const relayCorsOrigins = normalizeOrigins([officialWebUrl])
        corsOrigins = relayFlag.enabled
            ? mergeCorsOrigins(baseCorsOrigins, relayCorsOrigins)
            : baseCorsOrigins

        if (config.cliApiTokenIsNew) {
            console.log('')
            console.log('='.repeat(70))
            console.log('  NEW CLI_API_TOKEN GENERATED')
            console.log('='.repeat(70))
            console.log('')
            console.log(`  Token: ${config.cliApiToken}`)
            console.log('')
            console.log(`  Saved to: ${config.settingsFile}`)
            console.log('')
            console.log('='.repeat(70))
            console.log('')
        } else {
            console.log(`[Hub] CLI_API_TOKEN: loaded from ${formatSource(config.sources.cliApiToken)}`)
        }

        console.log(`[Hub] VIBY_LISTEN_HOST: ${config.listenHost} (${formatSource(config.sources.listenHost)})`)
        console.log(`[Hub] VIBY_LISTEN_PORT: ${config.listenPort} (${formatSource(config.sources.listenPort)})`)
        console.log(`[Hub] VIBY_PUBLIC_URL: ${config.publicUrl} (${formatSource(config.sources.publicUrl)})`)
        console.log(
            relayFlag.enabled
                ? `[Hub] Tunnel: enabled (${relayFlag.source}), API: ${relayApiDomain}`
                : `[Hub] Tunnel: disabled (${relayFlag.source})`
        )

        store = new Store(config.dbPath)
        jwtSecret = await getOrCreateJwtSecret()
        const vapidKeys = await getOrCreateVapidKeys(config.dataDir)
        vapidPublicKey = vapidKeys.publicKey
        const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:admin@viby.run'
        pushService = new PushService(vapidKeys, vapidSubject, store)
        socketServer = createSocketServer({
            store,
            jwtSecret,
            corsOrigins,
            getSession: (sessionId) => {
                const activeEngine = runtimeAccessor.getSyncEngine()
                return activeEngine?.getSession(sessionId) ?? store!.sessions.getSession(sessionId)
            },
            onWebappEvent: (event) => {
                runtimeAccessor.getSyncEngine()?.handleRealtimeEvent(event)
            },
            onSessionAlive: (payload) => {
                runtimeAccessor.getSyncEngine()?.handleSessionAlive(payload)
            },
            onSessionEnd: (payload) => {
                runtimeAccessor.getSyncEngine()?.handleSessionEnd(payload)
            },
            onMachineAlive: (payload) => {
                runtimeAccessor.getSyncEngine()?.handleMachineAlive(payload)
            }
        })

        try {
            webServer = await startWebServer(buildWebServerOptions())
        } catch (error) {
            const shouldFallbackPort = launchSource === 'desktop' && isAddressInUseError(error)
            if (!shouldFallbackPort) {
                throw error
            }

            runtimeListenPort = await findAvailablePort(config.listenHost)
            localHubUrl = resolveLocalApiUrl(config.listenHost, runtimeListenPort)
            runtimePublicUrl = localHubUrl
            portFallbackMessage = `默认端口 ${config.listenPort} 已被占用，已自动切换到 ${runtimeListenPort}。`
            console.warn(`[Web] ${portFallbackMessage}`)

            await persistResolvedListenPort({
                dataDir: config.dataDir,
                listenHost: config.listenHost,
                previousPort: config.listenPort,
                resolvedPort: runtimeListenPort
            })

            webServer = await startWebServer(buildWebServerOptions())
        }

        activeRuntimeStatus = createHubRuntimeStatusWriter({
            dataDir: config.dataDir,
            listenHost: config.listenHost,
            listenPort: runtimeListenPort,
            localHubUrl,
            cliApiToken: config.cliApiToken,
            settingsFile: config.settingsFile,
            relayEnabled: relayFlag.enabled,
            launchSource
        })
        await activeRuntimeStatus.write({
            phase: 'starting',
            preferredBrowserUrl: localHubUrl,
            message: buildStartingStatusMessage(buildStartupMessage(relayFlag.enabled))
        })
    }

    function createRuntimeCore() {
        const currentSocketServer = getSocketServer()
        return createHubRuntimeCore({
            store: getStore(),
            io: currentSocketServer.io,
            rpcRegistry: currentSocketServer.rpcRegistry,
            webRealtimeManager: currentSocketServer.webRealtimeManager,
            notificationChannels: [
                new PushNotificationChannel(getPushService(), currentSocketServer.webRealtimeManager, runtimePublicUrl)
            ]
        })
    }

    function createRuntimeHostInstance(): HubRuntimeHost {
        if (!webServer || !activeRuntimeStatus) {
            throw new Error('Hub runtime host is not initialized.')
        }

        const runtimeStatus = activeRuntimeStatus
        const managedRunner = createManagedRunnerController({
            dataDir: getConfig().dataDir,
            localHubUrl,
            getSyncEngine: () => runtimeAccessor.getSyncEngine(),
            isShuttingDown: () => shuttingDown,
            writeRuntimeStatus: async (update) => {
                await runtimeStatus.write(update)
            },
            buildReadyStatusMessage,
            buildStartingStatusMessage
        })

        return createHubRuntimeHost({
            runtimeAccessor,
            createRuntimeCore,
            createWebFetch: () => createWebServerFetch(buildWebServerOptions()),
            webServer,
            runtimeStatus: activeRuntimeStatus,
            managedRunner,
            localHubUrl,
            runtimeListenPort,
            cliApiToken: getConfig().cliApiToken,
            relayEnabled: relayFlag.enabled,
            relayApiDomain,
            officialWebUrl,
            portFallbackMessage
        })
    }

    async function ensureRuntimeHost(): Promise<HubRuntimeHost> {
        await initializeProcess()
        if (runtimeHost) {
            return runtimeHost
        }

        runtimeHost = createRuntimeHostInstance()
        return runtimeHost
    }

    async function shutdownProcessOnly(options: HubShutdownOptions): Promise<number> {
        if (webServer || activeRuntimeStatus) {
            console.log(options.logMessage ?? '\nShutting down...')
        }

        if (activeRuntimeStatus) {
            await activeRuntimeStatus.write({
                phase: options.statusPhase ?? 'stopped',
                preferredBrowserUrl: localHubUrl,
                message: options.statusMessage ?? 'Hub stopped.'
            })
        }

        runtimeAccessor.disposeRuntime()
        webServer?.stop()

        return options.exitCode ?? 0
    }

    async function reloadRuntime(): Promise<void> {
        const host = await ensureRuntimeHost()
        await host.reloadRuntime()
    }

    async function start(): Promise<void> {
        if (started) {
            return
        }

        const host = await ensureRuntimeHost()
        await host.start()

        started = true
        console.log('')
        console.log('viby hub is ready!')
    }

    async function shutdown(options: HubShutdownOptions = {}): Promise<number> {
        if (shutdownPromise) {
            return await shutdownPromise
        }

        shuttingDown = true
        shutdownPromise = (async () => {
            const exitCode = runtimeHost
                ? await runtimeHost.shutdown(options)
                : await shutdownProcessOnly(options)

            runtimeHost = null
            webServer = null
            activeRuntimeStatus = null
            started = false
            return exitCode
        })()

        return await shutdownPromise
    }

    return {
        start,
        reloadRuntime,
        shutdown
    }
}
