import { useQuery } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import type { ApiClient } from '@/api/client'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { queryKeys } from '@/lib/query-keys'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import type { AgentFlavor, AgentLaunchConfig, RuntimeCapabilitySnapshot } from '@/types/api'

type TranslationFn = (key: string, params?: Record<string, string | number>) => string

type UseAgentLaunchConfigOptions = {
    api: ApiClient
    agent: AgentFlavor
    directory: string
    t: TranslationFn
}

type AgentLaunchConfigState = {
    config: AgentLaunchConfig | null
    error: string | null
    refetch: () => Promise<unknown>
}

const AGENT_LAUNCH_CONFIG_DIRECTORY_DEBOUNCE_MS = 200
const UNSUPPORTED_CONFIG_RESPONSE_MESSAGE = 'Unsupported agent launch config response'

function getDirectoryAwareCacheKey(agent: AgentFlavor, directory: string): string {
    return agent === 'claude' || agent === 'codex' || agent === 'gemini' || agent === 'pi' ? directory : ''
}

function getLaunchConfigError(
    snapshot: RuntimeCapabilitySnapshot | null,
    agent: AgentFlavor,
    t: TranslationFn
): string | null {
    const item = snapshot?.agents.find((candidate) => candidate.driver === agent)?.launchConfig
    if (!item?.error) return null
    return t(`runtimeCapability.error.${item.error.code}`)
}

export function useRuntimeAgentLaunchConfig(options: UseAgentLaunchConfigOptions): AgentLaunchConfigState {
    const rawDirectory = options.directory.trim()
    const directory = useDebouncedValue(rawDirectory, AGENT_LAUNCH_CONFIG_DIRECTORY_DEBOUNCE_MS)
    const configDirectoryKey = getDirectoryAwareCacheKey(options.agent, directory)
    const forceRefreshRef = useRef(false)
    const query = useQuery({
        queryKey: queryKeys.runtimeCapabilities(configDirectoryKey, options.agent, 'launch_config'),
        enabled: Boolean(directory),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        queryFn: async ({ signal }) => {
            const forceRefresh = forceRefreshRef.current
            forceRefreshRef.current = false
            const response = await options.api.getRuntimeCapabilities({
                drivers: [options.agent],
                directory,
                depth: 'launch_config',
                ...(forceRefresh ? { forceRefresh: true } : {}),
                signal,
            })
            const config = response.snapshot.agents.find((agent) => agent.driver === options.agent)?.launchConfig.config
            if (config && config.agent !== options.agent) throw new Error(UNSUPPORTED_CONFIG_RESPONSE_MESSAGE)
            return response.snapshot
        },
    })

    const refresh = useCallback(async () => {
        forceRefreshRef.current = true
        return await query.refetch()
    }, [query.refetch])

    const config = query.data?.agents.find((agent) => agent.driver === options.agent)?.launchConfig.config ?? null
    return {
        config,
        error:
            getLaunchConfigError(query.data ?? null, options.agent, options.t) ??
            formatOptionalUserFacingErrorMessage(query.error, {
                t: options.t,
                fallbackKey: 'error.session.create',
            }),
        refetch: refresh,
    }
}
