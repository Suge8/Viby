import { listBuiltinSlashCommands } from './slashCommandConfig'
import { scanPluginCommands } from './slashCommandPlugins'
import { scanProjectCommands, scanUserCommands } from './slashCommandScanner'
import type { SlashCommand } from './slashCommandTypes'

export type { SlashCommand } from './slashCommandTypes'

/**
 * List all available slash commands for an agent type.
 * Returns built-in commands, user-defined commands, plugin commands, and project commands.
 *
 * Merge order follows locality precedence for custom commands:
 * built-in -> global user -> plugin -> project (project overrides same-name globals).
 */
export async function listSlashCommands(agent: string, projectDir?: string): Promise<SlashCommand[]> {
    const builtin = listBuiltinSlashCommands(agent)
    const [user, plugin, project] = await Promise.all([
        scanUserCommands(agent),
        scanPluginCommands(agent),
        scanProjectCommands(agent, projectDir),
    ])

    const allCommands = [...builtin, ...user, ...plugin, ...project]
    const commandMap = new Map<string, SlashCommand>()
    for (const command of allCommands) {
        if (commandMap.has(command.name)) {
            commandMap.delete(command.name)
        }
        commandMap.set(command.name, command)
    }

    return Array.from(commandMap.values())
}
