import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { getCommandFileExtension, getProjectCommandsDir, getUserCommandsDir } from './slashCommandConfig'
import { parseFrontmatter, parseTomlCommand } from './slashCommandParsers'
import type { SlashCommand, SlashCommandSource } from './slashCommandTypes'

type SlashCommandFileExtension = ReturnType<typeof getCommandFileExtension>
type ScannedSlashCommandSource = Exclude<SlashCommandSource, 'builtin'>
type SlashCommandScanContext = {
    source: ScannedSlashCommandSource
    fileExtension: SlashCommandFileExtension
    pluginName?: string
}

const DEFAULT_CUSTOM_COMMAND_DESCRIPTION = 'Custom command'

export async function scanCommandsDir(
    agent: string,
    dir: string,
    source: ScannedSlashCommandSource,
    pluginName?: string
): Promise<SlashCommand[]> {
    const commands = await scanRecursiveCommands(agent, dir, [], {
        source,
        fileExtension: getCommandFileExtension(agent),
        pluginName,
    })
    return commands.sort((a, b) => a.name.localeCompare(b.name))
}

export async function scanUserCommands(agent: string): Promise<SlashCommand[]> {
    const dir = getUserCommandsDir(agent)
    if (!dir) {
        return []
    }
    return await scanCommandsDir(agent, dir, 'user')
}

export async function scanProjectCommands(agent: string, projectDir?: string): Promise<SlashCommand[]> {
    if (!projectDir) {
        return []
    }

    const dir = getProjectCommandsDir(agent, projectDir)
    if (!dir) {
        return []
    }

    return await scanCommandsDir(agent, dir, 'project')
}

async function scanRecursiveCommands(
    agent: string,
    currentDir: string,
    segments: string[],
    context: SlashCommandScanContext
): Promise<SlashCommand[]> {
    let entries = null
    try {
        entries = await readdir(currentDir, { withFileTypes: true })
    } catch {
        entries = null
    }
    if (!entries) {
        return []
    }

    const commandsByEntry = await Promise.all(
        entries.map(async (entry): Promise<SlashCommand[]> => {
            if (entry.name.startsWith('.') || entry.isSymbolicLink()) {
                return []
            }

            if (entry.isDirectory()) {
                if (entry.name.includes(':')) {
                    return []
                }
                return await scanRecursiveCommands(
                    agent,
                    join(currentDir, entry.name),
                    [...segments, entry.name],
                    context
                )
            }

            if (!entry.isFile() || !entry.name.endsWith(context.fileExtension)) {
                return []
            }

            const baseName = entry.name.slice(0, -context.fileExtension.length)
            if (!baseName || baseName.includes(':')) {
                return []
            }

            return [await readSlashCommand(join(currentDir, entry.name), [...segments, baseName], context)]
        })
    )

    return commandsByEntry.flat()
}

async function readSlashCommand(
    filePath: string,
    nameSegments: string[],
    context: SlashCommandScanContext
): Promise<SlashCommand> {
    const localName = nameSegments.join(':')
    const name = context.pluginName ? `${context.pluginName}:${localName}` : localName
    const fallbackDescription =
        context.source === 'plugin' ? `${context.pluginName ?? 'plugin'} command` : DEFAULT_CUSTOM_COMMAND_DESCRIPTION

    try {
        const fileContent = await readFile(filePath, 'utf-8')
        const parsed = context.fileExtension === '.toml' ? parseTomlCommand(fileContent) : parseFrontmatter(fileContent)

        return {
            name,
            description: parsed.description ?? fallbackDescription,
            source: context.source,
            content: parsed.content,
            pluginName: context.pluginName,
        }
    } catch {
        return {
            name,
            description: fallbackDescription,
            source: context.source,
            pluginName: context.pluginName,
        }
    }
}
