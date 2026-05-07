import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { queryKeys } from '@/lib/query-keys'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import type { AgentFlavor, AgentLaunchConfig } from '@/types/api'

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
}

const AGENT_LAUNCH_CONFIG_STALE_TIME_MS = 60_000
const AGENT_LAUNCH_CONFIG_DIRECTORY_DEBOUNCE_MS = 200
const UNSUPPORTED_CONFIG_RESPONSE_MESSAGE = 'Unsupported agent launch config response'

function getDirectoryAwareCacheKey(agent: AgentFlavor, directory: string): string {
    return agent === 'claude' || agent === 'codex' || agent === 'gemini' || agent === 'pi' ? directory : ''
}

export function useRuntimeAgentLaunchConfig(options: UseAgentLaunchConfigOptions): AgentLaunchConfigState {
    const rawDirectory = options.directory.trim()
    const directory = useDebouncedValue(rawDirectory, AGENT_LAUNCH_CONFIG_DIRECTORY_DEBOUNCE_MS)
    const configDirectoryKey = getDirectoryAwareCacheKey(options.agent, directory)
    const query = useQuery({
        queryKey: queryKeys.runtimeAgentLaunchConfig(options.agent, configDirectoryKey),
        enabled: Boolean(directory),
        staleTime: AGENT_LAUNCH_CONFIG_STALE_TIME_MS,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        queryFn: async ({ signal }) => {
            const response = await options.api.resolveAgentLaunchConfig({
                agent: options.agent,
                directory,
                signal,
            })

            if (response.type === 'error') {
                throw new Error(response.message)
            }
            if (response.config.agent !== options.agent) {
                throw new Error(UNSUPPORTED_CONFIG_RESPONSE_MESSAGE)
            }

            return response.config
        },
    })

    return {
        config: query.data ?? null,
        error: formatOptionalUserFacingErrorMessage(query.error, {
            t: options.t,
            fallbackKey: 'error.session.create',
            allowPassthrough: true,
        }),
    }
}
