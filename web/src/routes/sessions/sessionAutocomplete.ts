import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { getAutocompleteSearchTerm } from '@/hooks/queries/autocompleteFuzzyMatch'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { getRecentSkills } from '@/lib/recent-skills'
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

    if (prefix === '$') {
        const recent = getRecentSkills()
        const getRecency = (text: string) => recent[text.slice(1)] ?? 0
        return matchedCapabilities
            .map((capability) => toSuggestion(capability))
            .sort((a, b) => getRecency(b.text) - getRecency(a.text) || a.text.localeCompare(b.text))
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
