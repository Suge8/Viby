import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { GitStatusFiles } from '@/types/api'
import { buildGitStatusFiles } from '@/lib/gitParsers'
import { queryKeys } from '@/lib/query-keys'
import {
    formatOptionalUserFacingErrorMessage,
    formatUserFacingErrorMessage
} from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'

export function useGitStatusFiles(api: ApiClient | null, sessionId: string | null): {
    status: GitStatusFiles | null
    error: string | null
    isLoading: boolean
    refetch: () => Promise<unknown>
} {
    const { t } = useTranslation()
    const resolvedSessionId = sessionId ?? 'unknown'
    const query = useQuery({
        queryKey: queryKeys.gitStatus(resolvedSessionId),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }

            const statusResult = await api.getGitStatus(sessionId)
            if (!statusResult.success) {
                return {
                    status: null,
                    error: formatUserFacingErrorMessage(
                        statusResult.error ?? statusResult.stderr,
                        {
                            t,
                            fallbackKey: 'error.files.git'
                        }
                    )
                }
            }

            const [unstagedResult, stagedResult] = await Promise.all([
                api.getGitDiffNumstat(sessionId, false),
                api.getGitDiffNumstat(sessionId, true)
            ])

            const status = buildGitStatusFiles(
                statusResult.stdout ?? '',
                unstagedResult.success ? (unstagedResult.stdout ?? '') : '',
                stagedResult.success ? (stagedResult.stdout ?? '') : ''
            )

            const errors: string[] = []
            if (!unstagedResult.success) {
                errors.push(formatUserFacingErrorMessage(
                    unstagedResult.error ?? unstagedResult.stderr,
                    {
                        t,
                        fallbackKey: 'file.error.diffUnavailable'
                    }
                ))
            }
            if (!stagedResult.success) {
                errors.push(formatUserFacingErrorMessage(
                    stagedResult.error ?? stagedResult.stderr,
                    {
                        t,
                        fallbackKey: 'file.error.diffUnavailable'
                    }
                ))
            }

            return { status, error: errors.length ? errors.join(' ') : null }
        },
        enabled: Boolean(api && sessionId),
    })

    const queryError = formatOptionalUserFacingErrorMessage(query.error, {
        t,
        fallbackKey: 'error.files.git'
    })

    return {
        status: query.data?.status ?? null,
        error: queryError ?? query.data?.error ?? null,
        isLoading: query.isLoading,
        refetch: query.refetch
    }
}
