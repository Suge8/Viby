import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { TeamProjectHistoryResponse } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'

export function useTeamProjectHistory(
    api: ApiClient | null,
    projectId: string | null,
    enabled: boolean
): {
    history: TeamProjectHistoryResponse | null
    isLoading: boolean
    error: string | null
} {
    const { t } = useTranslation()
    const query = useQuery({
        queryKey: projectId ? queryKeys.teamProjectHistory(projectId) : ['team-project-history', 'missing'],
        enabled: Boolean(api && projectId && enabled),
        queryFn: async () => {
            if (!api || !projectId) {
                throw new Error('Team project history unavailable')
            }

            return await api.getTeamProjectHistory(projectId)
        }
    })

    return {
        history: query.data ?? null,
        isLoading: query.isLoading,
        error: formatOptionalUserFacingErrorMessage(query.error, {
            t,
            fallbackKey: 'error.session.load'
        })
    }
}
