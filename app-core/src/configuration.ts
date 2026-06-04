/**
 * Global configuration for Viby internal runtime
 *
 * Centralizes all configuration including environment variables and paths
 * Environment files should be loaded using Node's --env-file flag
 */

import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_VIBY_LOCAL_API_URL } from '@viby/protocol/runtimeDefaults'
import packageJson from '../package.json'

class Configuration {
    private _apiUrl: string
    private _hubOwnerToken: string
    // Directories and paths (from persistence)
    public readonly vibyHomeDir: string
    public readonly logsDir: string
    public readonly settingsFile: string
    public readonly privateKeyFile: string
    public readonly currentRuntimeVersion: string

    public readonly isExperimentalEnabled: boolean

    constructor() {
        // Server configuration
        this._apiUrl = process.env.VIBY_API_URL || DEFAULT_VIBY_LOCAL_API_URL
        this._hubOwnerToken = process.env.VIBY_HUB_OWNER_TOKEN || ''

        // Directory configuration - Priority: VIBY_HOME env > default home dir
        if (process.env.VIBY_HOME) {
            // Expand ~ to home directory if present
            const expandedPath = process.env.VIBY_HOME.replace(/^~/, homedir())
            this.vibyHomeDir = expandedPath
        } else {
            this.vibyHomeDir = join(homedir(), '.viby')
        }

        this.logsDir = join(this.vibyHomeDir, 'logs')
        this.settingsFile = join(this.vibyHomeDir, 'settings.toml')
        this.privateKeyFile = join(this.vibyHomeDir, 'access.key')
        this.isExperimentalEnabled = ['true', '1', 'yes'].includes(process.env.VIBY_EXPERIMENTAL?.toLowerCase() || '')

        this.currentRuntimeVersion = packageJson.version

        if (!existsSync(this.vibyHomeDir)) {
            mkdirSync(this.vibyHomeDir, { recursive: true })
        }
        // Ensure directories exist
        if (!existsSync(this.logsDir)) {
            mkdirSync(this.logsDir, { recursive: true })
        }
    }

    get apiUrl(): string {
        return this._apiUrl
    }

    _setApiUrl(url: string): void {
        this._apiUrl = url
    }

    get hubOwnerToken(): string {
        return this._hubOwnerToken
    }

    _setHubOwnerToken(token: string): void {
        this._hubOwnerToken = token
    }
}

export const configuration: Configuration = new Configuration()
