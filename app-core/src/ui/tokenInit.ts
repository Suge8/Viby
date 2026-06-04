/**
 * Token initialization module
 *
 * Handles Hub owner token initialization with priority:
 * 1. Environment variable (highest - allows temporary override)
 * 2. Settings file (~/.viby/settings.toml)
 * 3. Interactive prompt (only when both above are missing)
 */

import { stdin as input, stdout as output } from 'node:process'
import * as readline from 'node:readline/promises'
import chalk from 'chalk'
import { configuration } from '@/configuration'
import { readSettings, updateSettings } from '@/persistence'
import { initializeApiUrl } from '@/ui/apiUrlInit'

/**
 * Initialize Hub owner token
 * Must be called before any API operations
 */
export async function initializeToken(): Promise<void> {
    // Initialize API URL first (env > settings.toml > default)
    await initializeApiUrl()

    // 1. Environment variable has highest priority (allows temporary override)
    if (configuration.hubOwnerToken) {
        return
    }

    // 2. Read from settings file
    const settings = await readSettings()
    if (settings.hubOwnerToken) {
        configuration._setHubOwnerToken(settings.hubOwnerToken)
        return
    }

    // 3. Non-TTY environment cannot prompt, fail with clear error
    if (!process.stdin.isTTY) {
        throw new Error('Hub owner token is missing. Start Viby Desktop so AppCore can initialize local settings.')
    }

    // 4. Interactive prompt
    const token = await promptForToken()

    // 5. Save and update configuration
    await updateSettings((current) => ({
        ...current,
        hubOwnerToken: token,
    }))
    configuration._setHubOwnerToken(token)
}

async function promptForToken(): Promise<string> {
    const rl = readline.createInterface({ input, output })

    console.log(chalk.yellow('\nNo Hub owner token found.'))
    console.log(chalk.gray('Where to find it:'))
    console.log(chalk.gray('  1. Open Viby Desktop on this machine'))
    console.log(chalk.gray('  2. Read ~/.viby/settings.toml if you are debugging AppCore manually\n'))

    try {
        const token = await rl.question(chalk.cyan('Enter Hub owner token: '))
        if (!token.trim()) {
            throw new Error('Token cannot be empty')
        }
        console.log(chalk.green(`\nToken saved to ${configuration.settingsFile}`))
        return token.trim()
    } finally {
        rl.close()
    }
}
