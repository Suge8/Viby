/**
 * Hub Settings Management
 *
 * Handles loading and persistence of hub configuration.
 * Priority: environment variable > settings.toml > default value
 *
 * When a value is loaded from environment variable and not present in settings.toml,
 * it will be saved to settings.toml for future use
 */

import { isLocalNetworkHostname } from '@viby/protocol/networkScope'
import { DEFAULT_VIBY_LISTEN_HOST, DEFAULT_VIBY_LISTEN_PORT } from '@viby/protocol/runtimeDefaults'
import {
    buildLocalOriginAliases,
    isLoopbackOrigin,
    normalizeOrigins,
    resolveDefaultPublicApiUrl,
    resolveLocalApiUrl,
} from '../hubHelpers'
import { getSettingsFile, readSettings, writeSettings } from './settings'

export interface ServerSettings {
    listenHost: string
    listenPort: number
    publicUrl: string
    publicAccessEnabled: boolean
    corsOrigins: string[]
    pairingBrokerUrl: string | null
    pairingCreateToken: string | null
}

export interface ServerSettingsResult {
    settings: ServerSettings
    sources: {
        listenHost: 'env' | 'file' | 'default'
        listenPort: 'env' | 'file' | 'default'
        publicUrl: 'env' | 'file' | 'default'
        publicAccessEnabled: 'env' | 'file' | 'default'
        corsOrigins: 'env' | 'file' | 'default'
        pairingBrokerUrl: 'env' | 'file' | 'default'
        pairingCreateToken: 'env' | 'file' | 'default'
    }
    savedToFile: boolean
}

/**
 * Parse and normalize CORS origins
 */
function parseCorsOrigins(str: string): string[] {
    const entries = str
        .split(',')
        .map((origin) => origin.trim())
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

    return normalizeOrigins([...buildLocalOriginAliases(listenHost, listenPort), publicUrl])
}

function getDefaultPublicUrl(listenHost: string, listenPort: number): string {
    return resolveDefaultPublicApiUrl(listenHost, listenPort)
}

function hasConfiguredCorsOrigins(origins: string[] | undefined): origins is [string, ...string[]] {
    return Array.isArray(origins) && origins.length > 0
}

function parseBooleanSetting(value: string, name: string): boolean {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
    throw new Error(`${name} must be true or false`)
}

function validatePublicUrlSecurity(publicUrl: string, publicAccessEnabled: boolean): void {
    if (!publicAccessEnabled) return
    const parsed = new URL(publicUrl)
    if (parsed.protocol === 'https:' || isLocalNetworkHostname(parsed.hostname)) return
    throw new Error('VIBY_PUBLIC_URL must use HTTPS for public hosts')
}

function shouldReadPublicUrlFromFile(
    listenHostSource: ServerSettingsResult['sources']['listenHost'],
    publicUrl: string | undefined
): publicUrl is string {
    return listenHostSource !== 'env' && publicUrl !== undefined
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
        throw new Error(`Cannot read ${settingsFile}. Please fix or remove the file and restart.`)
    }

    let needsSave = false
    const sources: ServerSettingsResult['sources'] = {
        listenHost: 'default',
        listenPort: 'default',
        publicUrl: 'default',
        publicAccessEnabled: 'default',
        corsOrigins: 'default',
        pairingBrokerUrl: 'default',
        pairingCreateToken: 'default',
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
    } else if (shouldReadPublicUrlFromFile(sources.listenHost, settings.publicUrl)) {
        publicUrl = settings.publicUrl
        sources.publicUrl = 'file'
    }

    let publicAccessEnabled = true
    if (process.env.VIBY_PUBLIC_ACCESS_ENABLED?.trim()) {
        publicAccessEnabled = parseBooleanSetting(process.env.VIBY_PUBLIC_ACCESS_ENABLED, 'VIBY_PUBLIC_ACCESS_ENABLED')
        sources.publicAccessEnabled = 'env'
        if (settings.publicAccessEnabled === undefined) {
            settings.publicAccessEnabled = publicAccessEnabled
            needsSave = true
        }
    } else if (settings.publicAccessEnabled !== undefined) {
        publicAccessEnabled = settings.publicAccessEnabled
        sources.publicAccessEnabled = 'file'
    }

    validatePublicUrlSecurity(publicUrl, publicAccessEnabled)

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

    let pairingBrokerUrl: string | null = null
    if (process.env.PAIRING_BROKER_URL?.trim()) {
        pairingBrokerUrl = process.env.PAIRING_BROKER_URL.trim()
        sources.pairingBrokerUrl = 'env'
        if (settings.pairingBrokerUrl === undefined) {
            settings.pairingBrokerUrl = pairingBrokerUrl
            needsSave = true
        }
    } else if (settings.pairingBrokerUrl !== undefined) {
        pairingBrokerUrl = settings.pairingBrokerUrl || null
        sources.pairingBrokerUrl = 'file'
    }

    let pairingCreateToken: string | null = null
    if (process.env.PAIRING_CREATE_TOKEN?.trim()) {
        pairingCreateToken = process.env.PAIRING_CREATE_TOKEN.trim()
        sources.pairingCreateToken = 'env'
        if (settings.pairingCreateToken === undefined) {
            settings.pairingCreateToken = pairingCreateToken
            needsSave = true
        }
    } else if (settings.pairingCreateToken !== undefined) {
        pairingCreateToken = settings.pairingCreateToken || null
        sources.pairingCreateToken = 'file'
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
            publicAccessEnabled,
            corsOrigins,
            pairingBrokerUrl,
            pairingCreateToken,
        },
        sources,
        savedToFile: needsSave,
    }
}
