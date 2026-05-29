/**
 * Hub owner token management
 *
 * Handles automatic generation and persistence of VIBY_HUB_OWNER_TOKEN.
 * Priority: environment variable > settings.toml > auto-generate
 */

import { randomBytes } from 'node:crypto'
import { reportHubRuntimeWarning } from '../runtime/runtimeDiagnostics'
import { parseAccessToken } from '../utils/accessToken'
import { getOrCreateSettingsValue } from './generators'
import { getSettingsFile, readSettings, writeSettings } from './settings'

export interface HubOwnerTokenResult {
    token: string
    source: 'env' | 'file' | 'generated'
    isNew: boolean
    filePath: string
}

/**
 * Generate a cryptographically secure random token
 * 32 bytes = 256 bits, base64url encoded = ~43 characters
 */
function generateSecureToken(): string {
    return randomBytes(32).toString('base64url')
}

/**
 * Check if a token appears to be weak
 * Only applies to user-provided tokens (environment variable)
 */
function isWeakToken(token: string): boolean {
    if (token.length < 16) return true

    // Detect common weak patterns
    const weakPatterns = [
        /^[0-9]+$/, // Pure numbers
        /^(.)\1+$/, // Repeated character
        /^(abc|123|password|secret|token)/i, // Common prefixes
    ]
    return weakPatterns.some((p) => p.test(token))
}

function normalizeHubOwnerToken(rawToken: string, source: 'env' | 'file'): string {
    const parsed = parseAccessToken(rawToken)
    if (!parsed) {
        throw new Error(
            `VIBY_HUB_OWNER_TOKEN from ${source} is invalid. Single-user mode no longer accepts namespace suffixes.`
        )
    }
    return parsed
}

/**
 * Get or create Hub owner token
 *
 * Priority:
 * 1. VIBY_HUB_OWNER_TOKEN environment variable (advanced override)
 * 2. settings.toml hub_owner_token field
 * 3. Auto-generate and save to settings.toml
 */
export async function getOrCreateHubOwnerToken(dataDir: string): Promise<HubOwnerTokenResult> {
    const settingsFile = getSettingsFile(dataDir)

    // 1. Environment variable has highest priority for headless automation.
    const envToken = process.env.VIBY_HUB_OWNER_TOKEN
    if (envToken) {
        const normalizedToken = normalizeHubOwnerToken(envToken, 'env')
        if (isWeakToken(normalizedToken)) {
            reportHubRuntimeWarning('VIBY_HUB_OWNER_TOKEN appears to be weak. Consider using a stronger secret.')
        }

        // Persist env token to file if not already saved (prevents token loss on env var issues)
        const settings = await readSettings(settingsFile)
        if (settings !== null && !settings.hubOwnerToken) {
            settings.hubOwnerToken = normalizedToken
            await writeSettings(settingsFile, settings)
        }

        return {
            token: normalizedToken,
            source: 'env',
            isNew: false,
            filePath: settingsFile,
        }
    }

    const result = await getOrCreateSettingsValue({
        settingsFile,
        readValue: (settings) => {
            if (!settings.hubOwnerToken) {
                return null
            }
            return { value: normalizeHubOwnerToken(settings.hubOwnerToken, 'file') }
        },
        writeValue: (settings, value) => {
            settings.hubOwnerToken = value
        },
        generate: generateSecureToken,
    })

    return {
        token: result.value,
        source: result.created ? 'generated' : 'file',
        isNew: result.created,
        filePath: settingsFile,
    }
}
