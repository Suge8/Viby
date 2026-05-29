/**
 * Configuration for viby-hub
 *
 * Configuration is loaded with priority: environment variable > settings.toml > default
 * When values are read from environment variables and not present in settings.toml,
 * they are automatically saved for future use
 *
 * Optional environment variables:
 * - VIBY_HUB_OWNER_TOKEN: Internal Hub owner secret (auto-generated if not set)
 * - VIBY_LISTEN_HOST: Host/IP to bind the HTTP service (default: 0.0.0.0)
 * - VIBY_LISTEN_PORT: Port for HTTP service (default: 37173)
 * - VIBY_PUBLIC_URL: Public URL for external access
 * - VIBY_PUBLIC_ACCESS_ENABLED: Enable public Hub and pairing access (default: true)
 * - CORS_ORIGINS: Comma-separated CORS origins
 * - PAIRING_BROKER_URL: Public pairing broker base URL
 * - PAIRING_CREATE_TOKEN: Optional shared secret for pairing session creation
 * - VAPID_SUBJECT: Contact email or URL for Web Push (defaults to mailto:admin@viby.run)
 * - VIBY_HOME: Data directory (default: ~/.viby)
 * - DB_PATH: SQLite database path (default: {VIBY_HOME}/viby.db)
 */

import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getOrCreateHubOwnerToken } from './config/hubOwnerToken'
import { loadServerSettings, type ServerSettings, type ServerSettingsResult } from './config/serverSettings'
import { getSettingsFile } from './config/settings'

export type ConfigSource = 'env' | 'file' | 'default'

export interface ConfigSources {
    listenHost: ConfigSource
    listenPort: ConfigSource
    publicUrl: ConfigSource
    publicAccessEnabled: ConfigSource
    corsOrigins: ConfigSource
    pairingBrokerUrl: ConfigSource
    pairingCreateToken: ConfigSource
    hubOwnerToken: 'env' | 'file' | 'generated'
}

class Configuration {
    /** Internal owner token for local Hub management APIs */
    public hubOwnerToken: string

    /** Source of Hub owner token */
    public hubOwnerTokenSource: 'env' | 'file' | 'generated' | ''

    /** Whether Hub owner token was newly generated (for first-run display) */
    public hubOwnerTokenIsNew: boolean

    /** Path to settings.toml file */
    public readonly settingsFile: string

    /** Data directory for credentials and state */
    public readonly dataDir: string

    /** SQLite DB path */
    public readonly dbPath: string

    /** Port for the HTTP service */
    public readonly listenPort: number

    /** Host/IP to bind the HTTP service to */
    public readonly listenHost: string

    /** Public URL for external access */
    public readonly publicUrl: string

    /** Whether public Hub and pairing access are enabled */
    public readonly publicAccessEnabled: boolean

    /** Allowed CORS origins for the web app + Socket.IO (comma-separated env override) */
    public readonly corsOrigins: string[]

    /** Optional public pairing broker base URL */
    public readonly pairingBrokerUrl: string | null

    /** Optional pairing broker creation token */
    public readonly pairingCreateToken: string | null

    /** Sources of each configuration value */
    public readonly sources: ConfigSources

    /** Private constructor - use createConfiguration() instead */
    private constructor(
        dataDir: string,
        dbPath: string,
        serverSettings: ServerSettings,
        sources: ServerSettingsResult['sources']
    ) {
        this.dataDir = dataDir
        this.dbPath = dbPath
        this.settingsFile = getSettingsFile(dataDir)

        // Apply server settings
        this.listenHost = serverSettings.listenHost
        this.listenPort = serverSettings.listenPort
        this.publicUrl = serverSettings.publicUrl
        this.publicAccessEnabled = serverSettings.publicAccessEnabled
        this.corsOrigins = serverSettings.corsOrigins
        this.pairingBrokerUrl = serverSettings.pairingBrokerUrl
        this.pairingCreateToken = serverSettings.pairingCreateToken

        // Hub owner token - will be set by _setHubOwnerToken() before create() returns
        this.hubOwnerToken = ''
        this.hubOwnerTokenSource = ''
        this.hubOwnerTokenIsNew = false

        // Store sources for logging (hubOwnerToken will be set by _setHubOwnerToken)
        this.sources = {
            ...sources,
        } as ConfigSources

        // Ensure data directory exists
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true })
        }
    }

    /** Create configuration asynchronously */
    static async create(): Promise<Configuration> {
        // 1. Determine data directory (env only - not persisted)
        const dataDir = process.env.VIBY_HOME
            ? process.env.VIBY_HOME.replace(/^~/, homedir())
            : join(homedir(), '.viby')

        // Ensure data directory exists before loading settings
        if (!existsSync(dataDir)) {
            mkdirSync(dataDir, { recursive: true })
        }

        // 2. Determine DB path (env only - not persisted)
        const dbPath = process.env.DB_PATH ? process.env.DB_PATH.replace(/^~/, homedir()) : join(dataDir, 'viby.db')

        // 3. Load hub settings (with persistence)
        const settingsResult = await loadServerSettings(dataDir)

        if (settingsResult.savedToFile) {
            console.log(`[Hub] Configuration saved to ${getSettingsFile(dataDir)}`)
        }

        // 4. Create configuration instance
        const config = new Configuration(dataDir, dbPath, settingsResult.settings, settingsResult.sources)

        // 5. Load Hub owner token
        const tokenResult = await getOrCreateHubOwnerToken(dataDir)
        config._setHubOwnerToken(tokenResult.token, tokenResult.source, tokenResult.isNew)

        return config
    }

    /** Set Hub owner token (called during async initialization) */
    _setHubOwnerToken(token: string, source: 'env' | 'file' | 'generated', isNew: boolean): void {
        this.hubOwnerToken = token
        this.hubOwnerTokenSource = source
        this.hubOwnerTokenIsNew = isNew
        ;(this.sources as { hubOwnerToken: string }).hubOwnerToken = source
    }
}

// Singleton instance (set by createConfiguration)
let _configuration: Configuration | null = null

/**
 * Create and initialize configuration asynchronously.
 * Must be called once at startup before getConfiguration() can be used.
 */
export async function createConfiguration(): Promise<Configuration> {
    if (_configuration) {
        return _configuration
    }
    _configuration = await Configuration.create()
    return _configuration
}

/**
 * Get the initialized configuration.
 * Throws if createConfiguration() has not been called yet.
 */
export function getConfiguration(): Configuration {
    if (!_configuration) {
        throw new Error('Configuration not initialized. Call createConfiguration() first.')
    }
    return _configuration
}

export function hasConfiguration(): boolean {
    return _configuration !== null
}

// For compatibility - throws on access if not configured
export const configuration = new Proxy({} as Configuration, {
    get(_, prop) {
        return getConfiguration()[prop as keyof Configuration]
    },
})
