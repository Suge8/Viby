import { homedir } from 'os'
import { join } from 'path'
import type { SlashCommand } from './slashCommandTypes'

export type InstalledPluginsFile = {
    version: number
    plugins: Record<
        string,
        Array<{
            scope: string
            installPath: string
            version: string
            installedAt: string
            lastUpdated: string
            gitCommitSha?: string
        }>
    >
}

const BUILTIN_COMMANDS: Record<string, SlashCommand[]> = {
    claude: [
        { name: 'clear', description: 'Clear conversation history', source: 'builtin' },
        { name: 'new', description: 'Start a fresh conversation', source: 'builtin' },
        { name: 'compact', description: 'Compact conversation context', source: 'builtin' },
        { name: 'context', description: 'Show context information', source: 'builtin' },
        { name: 'cost', description: 'Show session cost', source: 'builtin' },
        { name: 'doctor', description: 'Diagnose Claude Code installation and settings', source: 'builtin' },
        { name: 'plan', description: 'Toggle plan mode', source: 'builtin' },
        { name: 'stats', description: 'Show Claude usage statistics', source: 'builtin' },
        { name: 'status', description: 'Show Claude status', source: 'builtin' },
    ],
    codex: [
        { name: 'compact', description: 'Summarize the conversation to save context', source: 'builtin' },
        { name: 'diff', description: 'Show the current git diff', source: 'builtin' },
        { name: 'fork', description: 'Fork the current conversation into a new thread', source: 'builtin' },
        { name: 'new', description: 'Start a new chat', source: 'builtin' },
        { name: 'review', description: 'Review current changes and find issues', source: 'builtin' },
        { name: 'rewind', description: 'Rewind to an earlier point in the conversation', source: 'builtin' },
        { name: 'status', description: 'Show current session configuration and usage', source: 'builtin' },
    ],
    gemini: [
        { name: 'agents reload', description: 'Reload the Gemini agent registry', source: 'builtin' },
        { name: 'commands reload', description: 'Reload custom slash commands', source: 'builtin' },
        { name: 'extensions reload', description: 'Reload active extensions', source: 'builtin' },
        { name: 'help', description: 'Show help for interactive commands', source: 'builtin' },
        { name: 'mcp reload', description: 'Restart and reload MCP servers', source: 'builtin' },
        { name: 'memory reload', description: 'Reload context files such as GEMINI.md', source: 'builtin' },
        { name: 'quit', description: 'Exit the interactive session', source: 'builtin' },
        { name: 'skills reload', description: 'Reload discovered skills from disk', source: 'builtin' },
    ],
    opencode: [],
}

export function listBuiltinSlashCommands(agent: string): SlashCommand[] {
    return BUILTIN_COMMANDS[agent] ?? []
}

export function getCommandFileExtension(agent: string): '.md' | '.toml' {
    return agent === 'gemini' ? '.toml' : '.md'
}

export function getUserCommandsDir(agent: string): string | null {
    switch (agent) {
        case 'claude': {
            const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
            return join(configDir, 'commands')
        }
        case 'codex': {
            const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex')
            return join(codexHome, 'prompts')
        }
        case 'gemini': {
            const geminiHome = process.env.GEMINI_HOME ?? join(homedir(), '.gemini')
            return join(geminiHome, 'commands')
        }
        default:
            return null
    }
}

export function getProjectCommandsDir(agent: string, projectDir: string): string | null {
    switch (agent) {
        case 'claude':
            return join(projectDir, '.claude', 'commands')
        case 'gemini':
            return join(projectDir, '.gemini', 'commands')
        default:
            return null
    }
}
