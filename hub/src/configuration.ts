/**
 * Configuration for viby-hub
 *
 * Configuration is loaded with priority: environment variable > settings.toml > default
 * When values are read from environment variables and not present in settings.toml,
 * they are automatically saved for future use
 *
 * Optional environment variables:
 * - CLI_API_TOKEN: Shared secret for viby CLI authentication (auto-generated if not set)
 * - VIBY_LISTEN_HOST: Host/IP to bind the HTTP service (default: 127.0.0.1)
 * - VIBY_LISTEN_PORT: Port for HTTP service (default: 37173)
 * - VIBY_PUBLIC_URL: Public URL for external access
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
import { getOrCreateCliApiToken } from './config/cliApiToken'
import { loadServerSettings, type ServerSettings, type ServerSettingsResult } from './config/serverSettings'
import { getSettingsFile } from './config/settings'

export type ConfigSource = 'env' | 'file' | 'default'

export interface ConfigSources {
    listenHost: ConfigSource
    listenPort: ConfigSource
    publicUrl: ConfigSource
    corsOrigins: ConfigSource
    cliApiToken: 'env' | 'file' | 'generated'
}

class Configuration {
    /** CLI auth token (shared secret) */
    public cliApiToken: string

    /** Source of CLI API token */
    public cliApiTokenSource: 'env' | 'file' | 'generated' | ''

    /** Whether CLI API token was newly generated (for first-run display) */
    public cliApiTokenIsNew: boolean

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
        this.corsOrigins = serverSettings.corsOrigins
        this.pairingBrokerUrl = process.env.PAIRING_BROKER_URL?.trim() || null
        this.pairingCreateToken = process.env.PAIRING_CREATE_TOKEN?.trim() || null

        // CLI API token - will be set by _setCliApiToken() before create() returns
        this.cliApiToken = ''
        this.cliApiTokenSource = ''
        this.cliApiTokenIsNew = false

        // Store sources for logging (cliApiToken will be set by _setCliApiToken)
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

        // 5. Load CLI API token
        const tokenResult = await getOrCreateCliApiToken(dataDir)
        config._setCliApiToken(tokenResult.token, tokenResult.source, tokenResult.isNew)

        return config
    }

    /** Set CLI API token (called during async initialization) */
    _setCliApiToken(token: string, source: 'env' | 'file' | 'generated', isNew: boolean): void {
        this.cliApiToken = token
        this.cliApiTokenSource = source
        this.cliApiTokenIsNew = isNew
        ;(this.sources as { cliApiToken: string }).cliApiToken = source
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
