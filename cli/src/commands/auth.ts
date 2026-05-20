import os from 'node:os'
import { stdin as input, stdout as output } from 'node:process'
import * as readline from 'node:readline/promises'
import chalk from 'chalk'
import { configuration } from '@/configuration'
import { clearMachineId, readSettings, updateSettings } from '@/persistence'
import { initializeApiUrl } from '@/ui/apiUrlInit'
import type { CommandDefinition } from './types'

export async function handleAuthCommand(args: string[]): Promise<void> {
    const subcommand = args[0]

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        showHelp()
        return
    }

    if (subcommand === 'status') {
        await initializeApiUrl()
        const settings = await readSettings()
        const envToken = process.env.VIBY_HUB_OWNER_TOKEN
        const settingsToken = settings.hubOwnerToken
        const hasToken = Boolean(envToken || settingsToken)
        const tokenSource = envToken ? 'environment' : settingsToken ? 'settings file' : 'none'
        console.log(chalk.bold('\nHeadless CLI Auth Status\n'))
        console.log(chalk.gray(`  VIBY_API_URL: ${configuration.apiUrl}`))
        console.log(chalk.gray(`  Hub owner token: ${hasToken ? 'set' : 'missing'}`))
        console.log(chalk.gray(`  Token source: ${tokenSource}`))
        console.log(chalk.gray(`  Machine ID: ${settings.machineId ?? 'not set'}`))
        console.log(chalk.gray(`  Host: ${os.hostname()}`))

        if (!hasToken) {
            console.log('')
            console.log(chalk.yellow('  Headless auth secret not configured. To get it:'))
            console.log(chalk.gray('    1. Read ~/.viby/settings.toml on the Hub machine'))
            console.log(chalk.gray('    2. Ask the Hub administrator for headless access'))
            console.log('')
            console.log(chalk.gray('  Then run: viby auth login'))
        }
        return
    }

    if (subcommand === 'login') {
        if (!process.stdin.isTTY) {
            console.error(chalk.red('Cannot prompt for token in non-TTY environment.'))
            console.error(chalk.gray('Set the Hub owner token in your environment instead.'))
            process.exit(1)
        }

        const rl = readline.createInterface({ input, output })

        try {
            const token = await rl.question(chalk.cyan('Enter Hub owner token: '))

            if (!token.trim()) {
                console.error(chalk.red('Token cannot be empty'))
                process.exit(1)
            }

            await updateSettings((current) => ({
                ...current,
                hubOwnerToken: token.trim(),
            }))
            configuration._setHubOwnerToken(token.trim())
            console.log(chalk.green(`\nToken saved to ${configuration.settingsFile}`))
        } finally {
            rl.close()
        }
        return
    }

    if (subcommand === 'logout') {
        await updateSettings((current) => ({
            ...current,
            hubOwnerToken: undefined,
        }))
        await clearMachineId()
        console.log(chalk.green('Cleared local credentials (token and machineId).'))
        console.log(chalk.gray('Note: an environment-provided Hub owner token still takes priority.'))
        return
    }

    console.error(chalk.red(`Unknown auth subcommand: ${subcommand}`))
    showHelp()
    process.exit(1)
}

function showHelp(): void {
    console.log(`
${chalk.bold('viby auth')} - Headless CLI authentication

${chalk.bold('Usage:')}
  viby auth status            Show current configuration
  viby auth login             Enter and save internal Hub owner token
  viby auth logout            Clear saved credentials

${chalk.bold('Token priority (highest to lowest):')}
  1. VIBY_HUB_OWNER_TOKEN
  2. ~/.viby/settings.toml
  3. Interactive prompt
`)
}

export const authCommand: CommandDefinition = {
    name: 'auth',
    requiresRuntimeAssets: true,
    run: async ({ commandArgs }) => {
        try {
            await handleAuthCommand(commandArgs)
        } catch (error) {
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error')
            if (process.env.DEBUG) {
                console.error(error)
            }
            process.exit(1)
        }
    },
}
