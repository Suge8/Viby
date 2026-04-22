import type { ConfigSource } from '../configuration'
import type { Store } from '../store'
import type { StartWebServerOptions } from '../web/server'

export function requireInitialized<T>(value: T | null, message: string): T {
    if (value === null) {
        throw new Error(message)
    }
    return value
}

function joinRuntimeStatusMessage(parts: ReadonlyArray<string | null | undefined>): string {
    return parts.filter((part): part is string => Boolean(part)).join(' ')
}

export function buildStartingStatusMessage(message: string, portFallbackMessage: string | null): string {
    return joinRuntimeStatusMessage([message, portFallbackMessage])
}

export function buildReadyStatusMessage(
    portFallbackMessage: string | null,
    overrides?: ReadonlyArray<string | null>
): string {
    return joinRuntimeStatusMessage(overrides ?? ['中枢已准备就绪。', portFallbackMessage])
}

export function buildProcessWebServerOptions(options: {
    getSyncEngine: StartWebServerOptions['getSyncEngine']
    getSessionStream: StartWebServerOptions['getSessionStream']
    jwtSecret: Uint8Array
    store: Store
    vapidPublicKey: string
    socketEngine: StartWebServerOptions['socketEngine']
    listenHost: string
    listenPort: number
    publicUrl: string
    corsOrigins: string[]
}): StartWebServerOptions {
    return {
        getSyncEngine: options.getSyncEngine,
        getSessionStream: options.getSessionStream,
        jwtSecret: options.jwtSecret,
        store: options.store,
        vapidPublicKey: options.vapidPublicKey,
        socketEngine: options.socketEngine,
        listenHost: options.listenHost,
        listenPort: options.listenPort,
        publicUrl: options.publicUrl,
        corsOrigins: options.corsOrigins,
    }
}

export function logHubStartupConfiguration(config: {
    cliApiTokenIsNew: boolean
    cliApiToken: string
    settingsFile: string
    listenHost: string
    listenPort: number
    publicUrl: string
    sources: {
        cliApiToken: ConfigSource | 'generated'
        listenHost: ConfigSource | 'generated'
        listenPort: ConfigSource | 'generated'
        publicUrl: ConfigSource | 'generated'
    }
    formatSource: (source: ConfigSource | 'generated') => string
}): void {
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
        console.log(`[Hub] CLI_API_TOKEN: loaded from ${config.formatSource(config.sources.cliApiToken)}`)
    }

    console.log(`[Hub] VIBY_LISTEN_HOST: ${config.listenHost} (${config.formatSource(config.sources.listenHost)})`)
    console.log(`[Hub] VIBY_LISTEN_PORT: ${config.listenPort} (${config.formatSource(config.sources.listenPort)})`)
    console.log(`[Hub] VIBY_PUBLIC_URL: ${config.publicUrl} (${config.formatSource(config.sources.publicUrl)})`)
}
