import { useCallback, useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import type { SlashCommand } from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import {
    getAutocompleteMatchScore,
    getAutocompleteSearchTerm
} from '@/hooks/queries/autocompleteFuzzyMatch'
import { queryKeys } from '@/lib/query-keys'
import { useSessionAutocompleteQuery } from './useSessionAutocompleteQuery'

/**
 * Built-in slash commands per agent type.
 * These are shown immediately without waiting for RPC.
 */
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

export function useSlashCommands(
    api: ApiClient | null,
    sessionId: string | null,
    agentType: string = 'claude'
): {
    commands: SlashCommand[]
    isLoading: boolean
    error: string | null
    getSuggestions: (query: string) => Promise<Suggestion[]>
} {
    const resolvedSessionId = sessionId ?? 'unknown'

    const queryOptions = useMemo(() => ({
        enabled: Boolean(api && sessionId),
        queryKey: queryKeys.slashCommands(resolvedSessionId),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }

            return await api.getSlashCommands(sessionId)
        },
    }), [api, resolvedSessionId, sessionId])

    const { query, ensureLoaded } = useSessionAutocompleteQuery(queryOptions)

    // Merge built-in commands with user-defined and plugin commands from API
    const commands = useMemo(() => {
        const builtin = BUILTIN_COMMANDS[agentType] ?? BUILTIN_COMMANDS.claude ?? []

        // If API succeeded, add user-defined and plugin commands
        if (query.data?.success && query.data.commands) {
            const extraCommands = query.data.commands.filter(
                cmd => cmd.source === 'user' || cmd.source === 'plugin' || cmd.source === 'project'
            )
            return [...builtin, ...extraCommands]
        }

        // Fallback to built-in commands only
        return builtin
    }, [agentType, query.data])

    const getSuggestions = useCallback(async (queryText: string): Promise<Suggestion[]> => {
        ensureLoaded()

        const searchTerm = getAutocompleteSearchTerm(queryText, '/')

        if (!searchTerm) {
            return commands.map(cmd => ({
                key: `/${cmd.name}`,
                text: `/${cmd.name}`,
                label: `/${cmd.name}`,
                description: cmd.description ?? (cmd.source === 'user' ? 'Custom command' : undefined),
                content: cmd.content,
                source: cmd.source
            }))
        }

        return commands
            .map((cmd) => {
                const name = cmd.name.toLowerCase()
                return {
                    cmd,
                    score: getAutocompleteMatchScore(searchTerm, name)
                }
            })
            .filter((item) => Number.isFinite(item.score))
            .sort((a, b) => a.score - b.score)
            .map(({ cmd }) => ({
                key: `/${cmd.name}`,
                text: `/${cmd.name}`,
                label: `/${cmd.name}`,
                description: cmd.description ?? (cmd.source === 'user' ? 'Custom command' : undefined),
                content: cmd.content,
                source: cmd.source
            }))
    }, [commands, ensureLoaded])

    return {
        commands,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load commands' : null,
        getSuggestions
    }
}
