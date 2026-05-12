import chalk from 'chalk'
import { runHubProcess } from '../../../hub/src/runtime/runProcess'
import { printCliAccessSummary } from './hubAccessSummary'
import { applyHubFlagsToEnv, HubFlagError, parseHubFlags } from './hubFlags'
import type { CommandContext, CommandDefinition } from './types'

function isFromDesktop(): boolean {
    return process.env.VIBY_LAUNCH_SOURCE === 'desktop'
}

export const hubCommand: CommandDefinition = {
    name: 'hub',
    requiresRuntimeAssets: true,
    run: async (context: CommandContext) => {
        try {
            const flags = parseHubFlags(context.commandArgs)
            applyHubFlagsToEnv(flags)

            await runHubProcess({
                onReady: async (status) => {
                    if (isFromDesktop()) return
                    await printCliAccessSummary(status)
                },
            })
        } catch (error) {
            if (error instanceof HubFlagError) {
                console.error(chalk.red('Error:'), error.message)
                console.error(chalk.gray('Run `viby help` to see available flags.'))
                process.exit(1)
            }
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error')
            if (process.env.DEBUG) {
                console.error(error)
            }
            process.exit(1)
        }
    },
}
