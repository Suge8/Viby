import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { TeamProjectSnapshot } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'

export function useTeamProject(api: ApiClient | null, projectId: string | null): {
    snapshot: TeamProjectSnapshot | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const { t } = useTranslation()
    const query = useQuery({
        queryKey: projectId ? queryKeys.teamProject(projectId) : ['team-project', 'missing'],
        enabled: Boolean(api && projectId),
        queryFn: async () => {
            if (!api || !projectId) {
                throw new Error('Team project unavailable')
            }

            return await api.getTeamProject(projectId)
        }
    })

    return {
        snapshot: query.data ?? null,
        isLoading: query.isLoading,
        error: formatOptionalUserFacingErrorMessage(query.error, {
            t,
            fallbackKey: 'error.session.load'
        }),
        refetch: query.refetch
    }
}
