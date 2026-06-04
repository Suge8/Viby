/**
 * Minimal persistence functions for Viby local state
 *
 * Handles settings and encryption key storage in ~/.viby/ (or VIBY_HOME override)
 */

import { existsSync } from 'node:fs'
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { parseVibyLocalSettingsToml, stringifyVibyLocalSettingsToml } from '@viby/protocol/localSettings'
import { configuration } from '@/configuration'

interface Settings {
    // This ID is used as the actual database ID on the server
    // All machine operations use this ID
    machineId?: string
    machineIdConfirmedByServer?: boolean
    hubOwnerToken?: string
    // API URL for server connections (priority: env VIBY_API_URL > this > default)
    apiUrl?: string
}

const defaultSettings: Settings = {}

async function removeFileIfPresent(filePath: string): Promise<void> {
    try {
        await unlink(filePath)
    } catch {}
}

export async function readSettings(): Promise<Settings> {
    try {
        if (!existsSync(configuration.settingsFile)) {
            return { ...defaultSettings }
        }

        const content = await readFile(configuration.settingsFile, 'utf8')
        return parseVibyLocalSettingsToml(content) as Settings
    } catch {
        return { ...defaultSettings }
    }
}

export async function writeSettings(settings: Settings): Promise<void> {
    if (!existsSync(configuration.vibyHomeDir)) {
        await mkdir(configuration.vibyHomeDir, { recursive: true })
    }

    await writeFile(configuration.settingsFile, stringifyVibyLocalSettingsToml(settings))
}

/**
 * Atomically update settings with multi-process safety via file locking
 * @param updater Function that takes current settings and returns updated settings
 * @returns The updated settings
 */
export async function updateSettings(updater: (current: Settings) => Settings | Promise<Settings>): Promise<Settings> {
    // Timing constants
    const LOCK_RETRY_INTERVAL_MS = 100 // How long to wait between lock attempts
    const MAX_LOCK_ATTEMPTS = 50 // Maximum number of attempts (5 seconds total)
    const STALE_LOCK_TIMEOUT_MS = 10000 // Consider lock stale after 10 seconds

    if (!existsSync(configuration.vibyHomeDir)) {
        await mkdir(configuration.vibyHomeDir, { recursive: true })
    }

    const lockFile = configuration.settingsFile + '.lock'
    const tmpFile = configuration.settingsFile + '.tmp'
    let fileHandle
    let attempts = 0

    // Acquire exclusive lock with retries
    while (attempts < MAX_LOCK_ATTEMPTS) {
        try {
            // 'wx' = create exclusively, fail if exists (cross-platform compatible)
            fileHandle = await open(lockFile, 'wx')
            break
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
                // Lock file exists, wait and retry
                attempts++
                await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS))

                // Check for stale lock
                try {
                    const stats = await stat(lockFile)
                    if (Date.now() - stats.mtimeMs > STALE_LOCK_TIMEOUT_MS) {
                        await removeFileIfPresent(lockFile)
                    }
                } catch {}
            } else {
                throw err
            }
        }
    }

    if (!fileHandle) {
        throw new Error(
            `Failed to acquire settings lock after ${(MAX_LOCK_ATTEMPTS * LOCK_RETRY_INTERVAL_MS) / 1000} seconds`
        )
    }

    try {
        // Read current settings with defaults
        const current = (await readSettings()) || { ...defaultSettings }

        // Apply update
        const updated = await updater(current)

        // Write atomically using rename
        await writeFile(tmpFile, stringifyVibyLocalSettingsToml(updated))
        await rename(tmpFile, configuration.settingsFile) // Atomic on POSIX

        return updated
    } finally {
        // Release lock
        await fileHandle.close()
        await removeFileIfPresent(lockFile) // Remove lock file
    }
}

//
// Authentication
//

export async function writeCredentialsDataKey(credentials: {
    publicKey: Uint8Array
    machineKey: Uint8Array
    token: string
}): Promise<void> {
    if (!existsSync(configuration.vibyHomeDir)) {
        await mkdir(configuration.vibyHomeDir, { recursive: true })
    }
    await writeFile(
        configuration.privateKeyFile,
        JSON.stringify(
            {
                encryption: {
                    publicKey: Buffer.from(credentials.publicKey).toString('base64'),
                    machineKey: Buffer.from(credentials.machineKey).toString('base64'),
                },
                token: credentials.token,
            },
            null,
            2
        )
    )
}

export async function clearCredentials(): Promise<void> {
    if (existsSync(configuration.privateKeyFile)) {
        await unlink(configuration.privateKeyFile)
    }
}

export async function clearMachineId(): Promise<void> {
    await updateSettings((settings) => ({
        ...settings,
        machineId: undefined,
    }))
}
