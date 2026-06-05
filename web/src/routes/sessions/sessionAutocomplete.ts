import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { getAutocompleteSearchTerm } from '@/hooks/queries/autocompleteFuzzyMatch'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import {
    filterCapabilitiesByPrefix,
    filterCapabilitiesBySearchTerm,
    loadCommandCapabilitiesResponse,
    toSuggestion,
} from '@/routes/sessions/SessionAutocompleteCapabilities'

type SessionAutocompleteHandler = (query: string) => Promise<Suggestion[]>

type CreateSessionAutocompleteSuggestionsOptions = {
    driver?: string | null
    agentType?: string
    api: ApiClient | null
    queryClient: QueryClient
    sessionId: string | null
}

type SessionAutocompleteSuggestionsOptions = CreateSessionAutocompleteSuggestionsOptions & {
    query: string
}

const EMPTY_NATIVE_SKILLS_SUGGESTION: Suggestion = {
    key: 'native-skills-empty',
    text: '$',
    label: '$',
    description: 'Current agent has no directly callable skills.',
    kind: 'native_skill',
    provider: 'shared',
    source: 'provider',
    selectionMode: 'disabled',
    disabled: true,
    disabledReason: 'Current agent has no directly callable skills.',
    groupLabel: 'Native Skills',
}

function normalizeQuery(prefix: '$' | '/', query: string): string {
    return query.startsWith(prefix) ? query : `${prefix}${query}`
}

async function loadSuggestions(options: SessionAutocompleteSuggestionsOptions): Promise<Suggestion[]> {
    const capabilitiesResponse = await loadCommandCapabilitiesResponse(options)
    const capabilities =
        capabilitiesResponse?.success && capabilitiesResponse.capabilities ? capabilitiesResponse.capabilities : []
    const prefix: '$' | '/' = options.query.startsWith('$') ? '$' : '/'
    const prefixedCapabilities = filterCapabilitiesByPrefix(capabilities, prefix)
    const searchTerm = getAutocompleteSearchTerm(options.query, prefix)
    const matchedCapabilities = searchTerm
        ? filterCapabilitiesBySearchTerm(prefixedCapabilities, searchTerm)
        : prefixedCapabilities

    if (prefix === '$' && prefixedCapabilities.length === 0) {
        return [EMPTY_NATIVE_SKILLS_SUGGESTION]
    }

    return matchedCapabilities.map((capability) => toSuggestion(capability))
}

export async function getSkillSuggestions(options: SessionAutocompleteSuggestionsOptions): Promise<Suggestion[]> {
    return await loadSuggestions({
        ...options,
        query: normalizeQuery('$', options.query),
    })
}

export async function getSlashCommandSuggestions(
    options: SessionAutocompleteSuggestionsOptions
): Promise<Suggestion[]> {
    return await loadSuggestions({
        ...options,
        query: normalizeQuery('/', options.query),
    })
}

export function createSessionAutocompleteSuggestions(
    options: CreateSessionAutocompleteSuggestionsOptions
): SessionAutocompleteHandler {
    return async (query: string) => {
        return await loadSuggestions({
            ...options,
            query,
        })
    }
}
