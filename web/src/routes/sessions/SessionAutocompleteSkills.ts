import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import {
    getAutocompleteMatchScore,
    getAutocompleteSearchTerm
} from '@/hooks/queries/autocompleteFuzzyMatch'
import { queryKeys } from '@/lib/query-keys'
import { getRecentSkills } from '@/lib/recent-skills'
import { getOrPrefetchSessionAutocompleteData } from '@/routes/sessions/sessionAutocompleteQuery'

type SkillsResponse = Awaited<ReturnType<ApiClient['getSkills']>>
type SkillList = NonNullable<SkillsResponse['skills']>

type SessionAutocompleteSkillsOptions = {
    api: ApiClient | null
    query: string
    queryClient: QueryClient
    sessionId: string | null
}

function getSkillsResponse(
    options: Omit<SessionAutocompleteSkillsOptions, 'query'>
): SkillsResponse | undefined {
    const { api, queryClient, sessionId } = options
    return getOrPrefetchSessionAutocompleteData<SkillsResponse>({
        enabled: Boolean(api && sessionId),
        queryClient,
        queryKey: queryKeys.skills(sessionId ?? 'unknown'),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }

            return await api.getSkills(sessionId)
        },
    })
}

function buildSkillSuggestions(
    skills: SkillList,
    query: string
): Suggestion[] {
    const recent = getRecentSkills()
    const getRecency = (name: string) => recent[name] ?? 0
    const searchTerm = getAutocompleteSearchTerm(query, '$')

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
        .map((skill) => ({
            skill,
            score: getAutocompleteMatchScore(searchTerm, skill.name.toLowerCase()),
            recency: getRecency(skill.name)
        }))
        .filter((item) => Number.isFinite(item.score))
        .sort((a, b) => a.score - b.score || b.recency - a.recency || a.skill.name.localeCompare(b.skill.name))
        .map(({ skill }) => ({
            key: `$${skill.name}`,
            text: `$${skill.name}`,
            label: `$${skill.name}`,
            description: skill.description,
            source: 'builtin'
        }))
}

export async function getSkillSuggestions(
    options: SessionAutocompleteSkillsOptions
): Promise<Suggestion[]> {
    const { query } = options
    const skillsResponse = getSkillsResponse(options)
    const skills = skillsResponse?.success && skillsResponse.skills ? skillsResponse.skills : []

    return buildSkillSuggestions(skills, query)
}
