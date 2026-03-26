import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import {
    getAutocompleteMatchScore,
    getAutocompleteSearchTerm
} from '@/hooks/queries/autocompleteFuzzyMatch'
import { queryKeys } from '@/lib/query-keys'
import { getOrPrefetchSessionAutocompleteData } from '@/routes/sessions/sessionAutocompleteQuery'
import type { SlashCommand } from '@/types/api'

type SlashCommandsResponse = Awaited<ReturnType<ApiClient['getSlashCommands']>>

type SessionAutocompleteSlashCommandsOptions = {
    agentType?: string
    api: ApiClient | null
    query: string
    queryClient: QueryClient
    sessionId: string | null
}

const BUILTIN_COMMANDS: Record<string, SlashCommand[]> = {
    claude: [
        { name: 'clear', description: 'Clear conversation history and free up context', source: 'builtin' },
        { name: 'compact', description: 'Clear conversation history but keep a summary in context', source: 'builtin' },
        { name: 'context', description: 'Visualize current context usage as a colored grid', source: 'builtin' },
        { name: 'cost', description: 'Show the total cost and duration of the current session', source: 'builtin' },
        { name: 'doctor', description: 'Diagnose and verify your Claude Code installation and settings', source: 'builtin' },
        { name: 'plan', description: 'View or open the current session plan', source: 'builtin' },
        { name: 'stats', description: 'Show your Claude Code usage statistics and activity', source: 'builtin' },
        { name: 'status', description: 'Show Claude Code status including version, model, account, and API connectivity', source: 'builtin' },
    ],
    codex: [
        { name: 'review', description: 'Review current changes and find issues', source: 'builtin' },
        { name: 'new', description: 'Start a new chat during a conversation', source: 'builtin' },
        { name: 'compat', description: 'Summarize conversation to prevent hitting the context limit', source: 'builtin' },
        { name: 'undo', description: 'Ask Codex to undo a turn', source: 'builtin' },
        { name: 'diff', description: 'Show git diff including untracked files', source: 'builtin' },
        { name: 'status', description: 'Show current session configuration and token usage', source: 'builtin' },
    ],
    cursor: [],
    gemini: [
        { name: 'about', description: 'Show version info', source: 'builtin' },
        { name: 'clear', description: 'Clear the screen and conversation history', source: 'builtin' },
        { name: 'compress', description: 'Compress the context by replacing it with a summary', source: 'builtin' },
        { name: 'stats', description: 'Check session stats', source: 'builtin' },
    ],
    opencode: [],
}

function getSlashCommandsResponse(
    options: Omit<SessionAutocompleteSlashCommandsOptions, 'agentType' | 'query'>
): SlashCommandsResponse | undefined {
    const { api, queryClient, sessionId } = options
    return getOrPrefetchSessionAutocompleteData<SlashCommandsResponse>({
        enabled: Boolean(api && sessionId),
        queryClient,
        queryKey: queryKeys.slashCommands(sessionId ?? 'unknown'),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }

            return await api.getSlashCommands(sessionId)
        },
    })
}

function getMergedCommands(
    agentType: string,
    response?: SlashCommandsResponse
): SlashCommand[] {
    const builtin = BUILTIN_COMMANDS[agentType] ?? BUILTIN_COMMANDS.claude ?? []
    if (!response?.success || !response.commands) {
        return builtin
    }

    const extraCommands = response.commands.filter(
        (command) => command.source === 'user' || command.source === 'plugin' || command.source === 'project'
    )
    return [...builtin, ...extraCommands]
}

function buildSlashCommandSuggestions(
    commands: readonly SlashCommand[],
    query: string
): Suggestion[] {
    const searchTerm = getAutocompleteSearchTerm(query, '/')
    if (!searchTerm) {
        return commands.map((command) => ({
            key: `/${command.name}`,
            text: `/${command.name}`,
            label: `/${command.name}`,
            description: command.description ?? (command.source === 'user' ? 'Custom command' : undefined),
            content: command.content,
            source: command.source
        }))
    }

    return commands
        .map((command) => ({
            command,
            score: getAutocompleteMatchScore(searchTerm, command.name.toLowerCase())
        }))
        .filter((item) => Number.isFinite(item.score))
        .sort((a, b) => a.score - b.score)
        .map(({ command }) => ({
            key: `/${command.name}`,
            text: `/${command.name}`,
            label: `/${command.name}`,
            description: command.description ?? (command.source === 'user' ? 'Custom command' : undefined),
            content: command.content,
            source: command.source
        }))
}

export async function getSlashCommandSuggestions(
    options: SessionAutocompleteSlashCommandsOptions
): Promise<Suggestion[]> {
    const { agentType = 'claude', query } = options
    const commandsResponse = getSlashCommandsResponse(options)
    const commands = getMergedCommands(agentType, commandsResponse)

    return buildSlashCommandSuggestions(commands, query)
}
