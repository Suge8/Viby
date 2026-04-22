import chalk from 'chalk'
import type { CommandDefinition } from './types'

const REMOVED_SESSION_COMMANDS = new Set(['codex', 'cursor', 'gemini', 'opencode'])

function printRootHelp(): void {
    console.log(`
${chalk.bold('viby')} - hub-first AI coding agent control

${chalk.bold('Usage:')}
  viby hub               Start the hub
  viby auth status       Show current auth configuration
  viby auth login        Save CLI_API_TOKEN locally
  viby auth logout       Clear saved credentials
  viby doctor            Diagnose the local environment
  viby runner status     Show runner status
  viby runner logs       Show latest runner log path
  viby runner stop       Stop the hub-managed runner
  viby mcp               Start MCP stdio bridge

${chalk.bold('Session creation:')}
  Start ${chalk.cyan('viby hub')}, open the web app / PWA, then create sessions there.
`)
}

function printRemovedSessionCommandNotice(command: string): void {
    console.error(chalk.red(`\`${command}\` is no longer a public viby command.`))
    console.error(chalk.gray('Session creation now lives in the hub / web app.'))
    console.error(chalk.gray('1. Start `viby hub`'))
    console.error(chalk.gray('2. Open the web app or PWA'))
    console.error(chalk.gray(`3. Create a ${command} session from the Machines / New Session flow`))
}

export const rootCommand: CommandDefinition = {
    name: 'help',
    requiresRuntimeAssets: false,
    run: async ({ subcommand }) => {
        if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
            printRootHelp()
            return
        }

        if (subcommand && REMOVED_SESSION_COMMANDS.has(subcommand)) {
            printRemovedSessionCommandNotice(subcommand)
            process.exit(1)
        }

        if (subcommand) {
            console.error(chalk.red(`Unknown command: ${subcommand}`))
            console.error(chalk.gray('Run `viby help` to see available commands.'))
            process.exit(1)
        }

        printRootHelp()
    },
}
