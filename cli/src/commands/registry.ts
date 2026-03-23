import { authCommand } from './auth'
import { connectCommand } from './connect'
import { runnerCommand } from './runner'
import { doctorCommand } from './doctor'
import { hookForwarderCommand } from './hookForwarder'
import { mcpCommand } from './mcp'
import { hubCommand } from './hub'
import { internalSessionCommand } from './internalSession'
import { rootCommand } from './root'
import type { CommandContext, CommandDefinition } from './types'

const COMMANDS: CommandDefinition[] = [
    authCommand,
    connectCommand,
    mcpCommand,
    hubCommand,
    internalSessionCommand,
    hookForwarderCommand,
    doctorCommand,
    runnerCommand
]

const commandMap = new Map<string, CommandDefinition>()
for (const command of COMMANDS) {
    commandMap.set(command.name, command)
}

export function resolveCommand(args: string[]): { command: CommandDefinition; context: CommandContext } {
    const subcommand = args[0]

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        return {
            command: rootCommand,
            context: {
                args,
                subcommand,
                commandArgs: subcommand ? args.slice(1) : args
            }
        }
    }

    const command = subcommand ? commandMap.get(subcommand) : undefined
    if (!command) {
        return {
            command: rootCommand,
            context: {
                args,
                subcommand,
                commandArgs: args.slice(1)
            }
        }
    }

    return {
        command,
        context: {
            args,
            subcommand,
            commandArgs: args.slice(1)
        }
    }
}
