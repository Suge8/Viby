/**
 * Hub Settings Management
 *
 * Handles loading and persistence of hub configuration.
 * Priority: environment variable > settings.toml > default value
 *
 * When a value is loaded from environment variable and not present in settings.toml,
 * it will be saved to settings.toml for future use
 */

import {
    DEFAULT_VIBY_LISTEN_HOST,
    DEFAULT_VIBY_LISTEN_PORT,
} from '@viby/protocol/runtimeDefaults'
import { buildLocalOriginAliases, isLoopbackOrigin, normalizeOrigins, resolveLocalApiUrl } from '../hubHelpers'
import { getSettingsFile, readSettings, writeSettings } from './settings'

export interface ServerSettings {
    listenHost: string
    listenPort: number
    publicUrl: string
    corsOrigins: string[]
}

export interface ServerSettingsResult {
    settings: ServerSettings
    sources: {
        listenHost: 'env' | 'file' | 'default'
        listenPort: 'env' | 'file' | 'default'
        publicUrl: 'env' | 'file' | 'default'
        corsOrigins: 'env' | 'file' | 'default'
    }
    savedToFile: boolean
}

/**
 * Parse and normalize CORS origins
 */
function parseCorsOrigins(str: string): string[] {
    const entries = str
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)

    if (entries.includes('*')) {
        return ['*']
    }

    const normalized: string[] = []
    for (const entry of entries) {
        try {
            normalized.push(new URL(entry).origin)
        } catch {
            // Keep raw value if it's already an origin-like string
            normalized.push(entry)
        }
    }
    return normalized
}

/**
 * Derive CORS origins from public URL
 */
function deriveCorsOrigins(listenHost: string, listenPort: number, publicUrl: string): string[] {
    if (isLoopbackOrigin(publicUrl)) {
        return buildLocalOriginAliases(listenHost, listenPort)
    }

    return normalizeOrigins([publicUrl])
}

function getDefaultPublicUrl(listenHost: string, listenPort: number): string {
    return resolveLocalApiUrl(listenHost, listenPort)
}

function hasConfiguredCorsOrigins(origins: string[] | undefined): origins is [string, ...string[]] {
    return Array.isArray(origins) && origins.length > 0
}

/**
 * Load hub settings with priority: env > file > default
 * Saves new env values to file when not already present
 */
export async function loadServerSettings(dataDir: string): Promise<ServerSettingsResult> {
    const settingsFile = getSettingsFile(dataDir)
    const settings = await readSettings(settingsFile)

    // If settings file exists but couldn't be parsed, fail fast
    if (settings === null) {
        throw new Error(
            `Cannot read ${settingsFile}. Please fix or remove the file and restart.`
        )
    }

    let needsSave = false
    const sources: ServerSettingsResult['sources'] = {
        listenHost: 'default',
        listenPort: 'default',
        publicUrl: 'default',
        corsOrigins: 'default',
    }

    // listenHost: env > file > default
    let listenHost = DEFAULT_VIBY_LISTEN_HOST
    if (process.env.VIBY_LISTEN_HOST) {
        listenHost = process.env.VIBY_LISTEN_HOST
        sources.listenHost = 'env'
        if (settings.listenHost === undefined) {
            settings.listenHost = listenHost
            needsSave = true
        }
    } else if (settings.listenHost !== undefined) {
        listenHost = settings.listenHost
        sources.listenHost = 'file'
    }

    // listenPort: env > file > default
    let listenPort = DEFAULT_VIBY_LISTEN_PORT
    if (process.env.VIBY_LISTEN_PORT) {
        const parsed = parseInt(process.env.VIBY_LISTEN_PORT, 10)
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error('VIBY_LISTEN_PORT must be a valid port number')
        }
        listenPort = parsed
        sources.listenPort = 'env'
        if (settings.listenPort === undefined) {
            settings.listenPort = listenPort
            needsSave = true
        }
    } else if (settings.listenPort !== undefined) {
        listenPort = settings.listenPort
        sources.listenPort = 'file'
    }

    // publicUrl: env > file > default
    let publicUrl = getDefaultPublicUrl(listenHost, listenPort)
    if (process.env.VIBY_PUBLIC_URL) {
        publicUrl = process.env.VIBY_PUBLIC_URL
        sources.publicUrl = 'env'
        if (settings.publicUrl === undefined) {
            settings.publicUrl = publicUrl
            needsSave = true
        }
    } else if (settings.publicUrl !== undefined) {
        publicUrl = settings.publicUrl
        sources.publicUrl = 'file'
    }

    // corsOrigins: env > file > derived from publicUrl
    let corsOrigins: string[]
    if (process.env.CORS_ORIGINS) {
        corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS)
        sources.corsOrigins = 'env'
        if (settings.corsOrigins === undefined) {
            settings.corsOrigins = corsOrigins
            needsSave = true
        }
    } else if (hasConfiguredCorsOrigins(settings.corsOrigins)) {
        corsOrigins = settings.corsOrigins
        sources.corsOrigins = 'file'
    } else {
        corsOrigins = deriveCorsOrigins(listenHost, listenPort, publicUrl)
    }

    // Save settings if any new values were added
    if (needsSave) {
        await writeSettings(settingsFile, settings)
    }

    return {
        settings: {
            listenHost,
            listenPort,
            publicUrl,
            corsOrigins,
        },
        sources,
        savedToFile: needsSave,
    }
}
