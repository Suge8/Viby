import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type { InstalledPluginsFile } from './slashCommandConfig'
import { scanCommandsDir } from './slashCommandScanner'
import type { SlashCommand } from './slashCommandTypes'

export async function scanPluginCommands(agent: string): Promise<SlashCommand[]> {
    if (agent !== 'claude') {
        return []
    }

    const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
    const installedPluginsPath = join(configDir, 'plugins', 'installed_plugins.json')

    try {
        const content = await readFile(installedPluginsPath, 'utf-8')
        const installedPlugins = JSON.parse(content) as InstalledPluginsFile
        if (!installedPlugins.plugins) {
            return []
        }

        const commandsByPlugin = await Promise.all(
            Object.entries(installedPlugins.plugins).map(async ([pluginKey, installations]) => {
                const installation = selectLatestInstallation(installations)
                if (!installation?.installPath) {
                    return []
                }

                const pluginName = extractPluginName(pluginKey)
                return await scanCommandsDir(agent, join(installation.installPath, 'commands'), 'plugin', pluginName)
            })
        )

        return commandsByPlugin.flat().sort((a, b) => a.name.localeCompare(b.name))
    } catch {
        return []
    }
}

function extractPluginName(pluginKey: string): string {
    const lastAtIndex = pluginKey.lastIndexOf('@')
    return lastAtIndex > 0 ? pluginKey.substring(0, lastAtIndex) : pluginKey
}

function selectLatestInstallation(installations: InstalledPluginsFile['plugins'][string]) {
    if (installations.length === 0) {
        return null
    }

    return [...installations].sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())[0]
}
