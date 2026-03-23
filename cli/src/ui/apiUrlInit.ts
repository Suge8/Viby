/**
 * API URL initialization module
 *
 * Handles VIBY_API_URL initialization with priority:
 * 1. Environment variable (highest - allows temporary override)
 * 2. Settings file (~/.viby/settings.toml)
 * 3. Default value (current Viby local hub URL)
 */

import { configuration } from '@/configuration'
import { readSettings } from '@/persistence'

/**
 * Initialize API URL
 * Must be called before any API operations
 */
export async function initializeApiUrl(): Promise<void> {
    // 1. Environment variable has highest priority (allows temporary override)
    if (process.env.VIBY_API_URL) {
        return
    }

    // 2. Read from settings file
    const settings = await readSettings()
    if (settings.apiUrl) {
        configuration._setApiUrl(settings.apiUrl)
        return
    }

    // 3. Default value already set in configuration constructor
}
