import type { WebSocketData } from '@socket.io/bun-engine'
import type { Server as BunServer } from 'bun'
import { getOrCreateJwtSecret } from '../config/jwtSecret'
import { findAvailablePort, isAddressInUseError, persistResolvedListenPort } from '../config/runtimeServerBinding'
import { getOrCreateVapidKeys } from '../config/vapidKeys'
import { createConfiguration } from '../configuration'
import { buildStartupMessage, formatSource, normalizeOrigins, resolveLocalApiUrl } from '../hubHelpers'
import { PushNotificationChannel } from '../push/pushNotificationChannel'
import { PushService } from '../push/pushService'
import { createHubRuntimeStatusWriter, type HubRuntimeStatusWriter } from '../runtimeStatus'
import { createSocketServer } from '../socket/server'
import { Store } from '../store'
import { createWebServerFetch, type StartWebServerOptions, startWebServer } from '../web/server'
import { createHubRuntimeAccessor } from './accessor'
import { createHubRuntimeCore } from './core'
import { createManagedRunnerController } from './managedRunner'
import {
    buildProcessWebServerOptions,
    buildReadyStatusMessage as buildReadyStatusMessageBase,
    buildStartingStatusMessage as buildStartingStatusMessageBase,
    logHubStartupConfiguration,
    requireInitialized,
} from './processControllerSupport'
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

export function createHubProcessController(): HubProcessController {
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

    const getConfig = (): NonNullable<typeof config> =>
        requireInitialized(config, 'Hub configuration is not initialized.')
    const getStore = (): Store => requireInitialized(store, 'Hub store is not initialized.')
    const getJwtSecret = (): Uint8Array => requireInitialized(jwtSecret, 'Hub JWT secret is not initialized.')
    const getVapidPublicKey = (): string =>
        requireInitialized(vapidPublicKey, 'Hub VAPID public key is not initialized.')
    const getPushService = (): PushService => requireInitialized(pushService, 'Hub push service is not initialized.')
    const getSocketServer = (): NonNullable<typeof socketServer> =>
        requireInitialized(socketServer, 'Hub socket server is not initialized.')

    function buildStartingStatusMessage(message: string): string {
        return buildStartingStatusMessageBase(message, portFallbackMessage)
    }

    function buildReadyStatusMessage(overrides?: ReadonlyArray<string | null>): string {
        return buildReadyStatusMessageBase(portFallbackMessage, overrides)
    }

    function buildWebServerOptions(): StartWebServerOptions {
        const currentStore = getStore()
        const currentSocketServer = getSocketServer()

        return buildProcessWebServerOptions({
            getSyncEngine: () => runtimeAccessor.getSyncEngine(),
            getSessionStream: (sessionId) => currentSocketServer.webRealtimeManager.getSessionStream(sessionId),
            jwtSecret: getJwtSecret(),
            store: currentStore,
            vapidPublicKey: getVapidPublicKey(),
            socketEngine: currentSocketServer.engine,
            listenHost: getConfig().listenHost,
            listenPort: runtimeListenPort,
            publicUrl: runtimePublicUrl,
            corsOrigins,
        })
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
        corsOrigins = baseCorsOrigins

        logHubStartupConfiguration({
            ...config,
            formatSource,
        })

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
            },
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
                resolvedPort: runtimeListenPort,
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
            launchSource,
        })
        await activeRuntimeStatus.write({
            phase: 'starting',
            preferredBrowserUrl: localHubUrl,
            message: buildStartingStatusMessage(buildStartupMessage()),
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
                new PushNotificationChannel(getPushService(), currentSocketServer.webRealtimeManager, runtimePublicUrl),
            ],
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
            buildStartingStatusMessage,
        })

        return createHubRuntimeHost({
            runtimeAccessor,
            createRuntimeCore,
            createWebFetch: () => createWebServerFetch(buildWebServerOptions()),
            webServer,
            runtimeStatus: activeRuntimeStatus,
            managedRunner,
            localHubUrl,
            portFallbackMessage,
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
                message: options.statusMessage ?? 'Hub stopped.',
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
            const exitCode = runtimeHost ? await runtimeHost.shutdown(options) : await shutdownProcessOnly(options)

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
        shutdown,
    }
}
