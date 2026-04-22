import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import type { RuntimeDirectoryEntry, RuntimeDirectoryRoot } from '@/types/api'

const RUNTIME_DIRECTORY_STALE_TIME_MS = 30_000

type UseRuntimeDirectoryBrowserOptions = {
    api: ApiClient
    initialPath?: string | null
    enabled?: boolean
}

type RuntimeDirectoryBrowserState = {
    currentPath: string
    parentPath: string | null
    entries: RuntimeDirectoryEntry[]
    roots: RuntimeDirectoryRoot[]
    error: string | null
    hasCurrentDirectory: boolean
    isLoading: boolean
    isRefreshing: boolean
    browseTo: (path?: string | null) => void
    refresh: () => Promise<unknown>
}

export function useRuntimeDirectoryBrowser(options: UseRuntimeDirectoryBrowserOptions): RuntimeDirectoryBrowserState {
    const { t } = useTranslation()
    const { api, initialPath, enabled = true } = options
    const [requestedPath, setRequestedPath] = useState<string | null>(initialPath?.trim() || null)

    useEffect(() => {
        if (!enabled) {
            return
        }

        setRequestedPath(initialPath?.trim() || null)
    }, [enabled, initialPath])

    const queryPath = requestedPath ?? ''
    const query = useQuery({
        queryKey: queryKeys.runtimeDirectory(queryPath),
        queryFn: async () => await api.browseRuntimeDirectory(requestedPath ?? undefined),
        enabled,
        staleTime: RUNTIME_DIRECTORY_STALE_TIME_MS,
    })

    const browseTo = useCallback((path?: string | null) => {
        setRequestedPath(path?.trim() || null)
    }, [])

    const currentPath = useMemo(
        () => query.data?.currentPath ?? requestedPath ?? '',
        [query.data?.currentPath, requestedPath]
    )
    const queryError = formatOptionalUserFacingErrorMessage(query.error, {
        t,
        fallbackKey: 'error.runtime.directory',
    })

    return {
        currentPath,
        parentPath: query.data?.parentPath ?? null,
        entries: query.data?.entries ?? [],
        roots: query.data?.roots ?? [],
        error:
            queryError ??
            formatOptionalUserFacingErrorMessage(query.data?.error, {
                t,
                fallbackKey: 'error.runtime.directory',
            }),
        hasCurrentDirectory: query.data?.success === true && Boolean(query.data.currentPath),
        isLoading: query.isLoading,
        isRefreshing: query.isFetching && !query.isLoading,
        browseTo,
        refresh: query.refetch,
    }
}
