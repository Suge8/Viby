import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Suggestion } from '@/hooks/useActiveSuggestions'

type SessionAutocompleteHandler = (query: string) => Promise<Suggestion[]>

type CreateSessionAutocompleteSuggestionsOptions = {
    agentType?: string
    api: ApiClient | null
    queryClient: QueryClient
    sessionId: string | null
}

type SkillsAutocompleteModule = typeof import('./SessionAutocompleteSkills')
type SlashAutocompleteModule = typeof import('./SessionAutocompleteSlashCommands')

let skillsAutocompleteModulePromise: Promise<SkillsAutocompleteModule> | null = null
let slashAutocompleteModulePromise: Promise<SlashAutocompleteModule> | null = null

function loadSkillsAutocompleteModule(): Promise<SkillsAutocompleteModule> {
    skillsAutocompleteModulePromise ??= import('./SessionAutocompleteSkills')
    return skillsAutocompleteModulePromise
}

function loadSlashAutocompleteModule(): Promise<SlashAutocompleteModule> {
    slashAutocompleteModulePromise ??= import('./SessionAutocompleteSlashCommands')
    return slashAutocompleteModulePromise
}

export function createSessionAutocompleteSuggestions(
    options: CreateSessionAutocompleteSuggestionsOptions
): SessionAutocompleteHandler {
    const { agentType = 'claude', api, queryClient, sessionId } = options

    return async (query: string) => {
        if (query.startsWith('$')) {
            const { getSkillSuggestions } = await loadSkillsAutocompleteModule()
            return await getSkillSuggestions({
                api,
                query,
                queryClient,
                sessionId
            })
        }

        const { getSlashCommandSuggestions } = await loadSlashAutocompleteModule()
        return await getSlashCommandSuggestions({
            agentType,
            api,
            query,
            queryClient,
            sessionId
        })
    }
}
