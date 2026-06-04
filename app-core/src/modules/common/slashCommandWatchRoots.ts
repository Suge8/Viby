import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { getProjectCommandsDir, getUserCommandsDir, type InstalledPluginsFile } from './slashCommandConfig'

async function listClaudePluginCommandDirs(): Promise<string[]> {
    const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
    const installedPluginsPath = join(configDir, 'plugins', 'installed_plugins.json')

    try {
        const content = await readFile(installedPluginsPath, 'utf-8')
        const installedPlugins = JSON.parse(content) as InstalledPluginsFile
        if (!installedPlugins.plugins) {
            return []
        }

        const commandDirs: string[] = []
        for (const installations of Object.values(installedPlugins.plugins)) {
            const latestInstallation = [...installations].sort((a, b) => {
                return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
            })[0]
            if (!latestInstallation?.installPath) {
                continue
            }

            commandDirs.push(join(latestInstallation.installPath, 'commands'))
        }

        return commandDirs
    } catch {
        return []
    }
}

export async function listSlashCommandWatchRoots(agent: string, projectDir?: string): Promise<string[]> {
    const roots: string[] = []
    const userCommandsDir = getUserCommandsDir(agent)
    if (userCommandsDir) {
        roots.push(userCommandsDir)
    }

    if (projectDir) {
        const projectCommandsDir = getProjectCommandsDir(agent, projectDir)
        if (projectCommandsDir) {
            roots.push(projectCommandsDir)
        }
    }

    if (agent === 'claude') {
        const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
        roots.push(join(configDir, 'plugins', 'installed_plugins.json'))
        roots.push(...(await listClaudePluginCommandDirs()))
    }

    return roots
}
