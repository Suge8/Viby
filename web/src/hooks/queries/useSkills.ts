import { useCallback, useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import type { SkillSummary } from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import {
    getAutocompleteMatchScore,
    getAutocompleteSearchTerm
} from '@/hooks/queries/autocompleteFuzzyMatch'
import { queryKeys } from '@/lib/query-keys'
import { getRecentSkills } from '@/lib/recent-skills'
import { useSessionAutocompleteQuery } from './useSessionAutocompleteQuery'

export function useSkills(
    api: ApiClient | null,
    sessionId: string | null
): {
    skills: SkillSummary[]
    isLoading: boolean
    error: string | null
    getSuggestions: (query: string) => Promise<Suggestion[]>
} {
    const resolvedSessionId = sessionId ?? 'unknown'

    const queryOptions = useMemo(() => ({
        enabled: Boolean(api && sessionId),
        queryKey: queryKeys.skills(resolvedSessionId),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }

            return await api.getSkills(sessionId)
        },
    }), [api, resolvedSessionId, sessionId])

    const { query, ensureLoaded } = useSessionAutocompleteQuery(queryOptions)

    const skills = useMemo(() => {
        if (query.data?.success && query.data.skills) {
            return query.data.skills
        }
        return []
    }, [query.data])

    const getSuggestions = useCallback(async (queryText: string): Promise<Suggestion[]> => {
        ensureLoaded()

        const recent = getRecentSkills()
        const getRecency = (name: string) => recent[name] ?? 0
        const searchTerm = getAutocompleteSearchTerm(queryText, '$')

        if (!searchTerm) {
            return [...skills]
                .sort((a, b) => getRecency(b.name) - getRecency(a.name) || a.name.localeCompare(b.name))
                .map((skill) => ({
                    key: `$${skill.name}`,
                    text: `$${skill.name}`,
                    label: `$${skill.name}`,
                    description: skill.description,
                    source: 'builtin'
                }))
        }

        return skills
            .map((skill) => {
                const name = skill.name.toLowerCase()
                return {
                    skill,
                    score: getAutocompleteMatchScore(searchTerm, name),
                    recency: getRecency(skill.name)
                }
            })
            .filter((item) => Number.isFinite(item.score))
            .sort((a, b) => a.score - b.score || b.recency - a.recency || a.skill.name.localeCompare(b.skill.name))
            .map(({ skill }) => ({
                key: `$${skill.name}`,
                text: `$${skill.name}`,
                label: `$${skill.name}`,
                description: skill.description,
                source: 'builtin'
            }))
    }, [ensureLoaded, skills])

    return {
        skills,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load skills' : null,
        getSuggestions
    }
}
