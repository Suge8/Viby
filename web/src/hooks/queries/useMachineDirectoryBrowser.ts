import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { MachineDirectoryEntry, MachineDirectoryRoot } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'

const MACHINE_DIRECTORY_STALE_TIME_MS = 30_000

type UseMachineDirectoryBrowserOptions = {
    api: ApiClient
    machineId: string | null
    initialPath?: string | null
    enabled?: boolean
}

type MachineDirectoryBrowserState = {
    currentPath: string
    parentPath: string | null
    entries: MachineDirectoryEntry[]
    roots: MachineDirectoryRoot[]
    error: string | null
    hasCurrentDirectory: boolean
    isLoading: boolean
    isRefreshing: boolean
    browseTo: (path?: string | null) => void
    refresh: () => Promise<unknown>
}

export function useMachineDirectoryBrowser(
    options: UseMachineDirectoryBrowserOptions
): MachineDirectoryBrowserState {
    const { t } = useTranslation()
    const { api, machineId, initialPath, enabled = true } = options
    const [requestedPath, setRequestedPath] = useState<string | null>(initialPath?.trim() || null)

    useEffect(() => {
        if (!enabled) {
            return
        }

        const nextPath = initialPath?.trim() || null
        setRequestedPath(nextPath)
    }, [enabled, initialPath, machineId])

    const queryPath = requestedPath ?? ''
    const query = useQuery({
        queryKey: queryKeys.machineDirectory(machineId ?? 'unknown', queryPath),
        queryFn: async () => {
            if (!machineId) {
                throw new Error('Machine unavailable')
            }

            return await api.browseMachineDirectory(machineId, requestedPath ?? undefined)
        },
        enabled: enabled && Boolean(machineId),
        staleTime: MACHINE_DIRECTORY_STALE_TIME_MS
    })

    const browseTo = useCallback((path?: string | null) => {
        setRequestedPath(path?.trim() || null)
    }, [])

    const currentPath = useMemo(() => {
        return query.data?.currentPath ?? requestedPath ?? ''
    }, [query.data?.currentPath, requestedPath])

    const queryError = formatOptionalUserFacingErrorMessage(query.error, {
        t,
        fallbackKey: 'error.machine.directory'
    })

    return {
        currentPath,
        parentPath: query.data?.parentPath ?? null,
        entries: query.data?.entries ?? [],
        roots: query.data?.roots ?? [],
        error: queryError ?? formatOptionalUserFacingErrorMessage(query.data?.error, {
            t,
            fallbackKey: 'error.machine.directory'
        }),
        hasCurrentDirectory: query.data?.success === true && Boolean(query.data.currentPath),
        isLoading: query.isLoading,
        isRefreshing: query.isFetching && !query.isLoading,
        browseTo,
        refresh: query.refetch
    }
}
