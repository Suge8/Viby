import type {
    AgentConfigDriver,
    AgentConfigFileState,
    AgentConfigResponse,
    RestoreAgentConfigRequest,
    SaveAgentConfigRequest,
} from '@viby/protocol/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LocalHubPairingClient } from '@/lib/localHubPairingClient'
import type { HubRuntimeStatus } from '@/types'

export type AgentConfigErrorCode = 'hub_unavailable' | 'load_failed' | 'save_failed'

type AgentConfigState = {
    response: AgentConfigResponse | null
    error: AgentConfigErrorCode | null
    loading: boolean
    savingDriver: AgentConfigDriver | null
    restoringDriver: AgentConfigDriver | null
    load(): void
    save(request: SaveAgentConfigRequest): Promise<AgentConfigFileState | null>
    restore(request: RestoreAgentConfigRequest): Promise<AgentConfigFileState | null>
}

function createClient(status?: HubRuntimeStatus): LocalHubPairingClient | null {
    if (!status?.localHubUrl || !status.hubOwnerToken) return null
    return new LocalHubPairingClient({ baseUrl: status.localHubUrl, hubOwnerToken: status.hubOwnerToken })
}

function createSourceKey(status: HubRuntimeStatus | undefined, ready: boolean): string {
    return ready && status?.localHubUrl && status.hubOwnerToken
        ? `${status.localHubUrl}\0${status.hubOwnerToken}`
        : 'offline'
}

export function useAgentConfig(
    status: HubRuntimeStatus | undefined,
    ready: boolean,
    enabled: boolean
): AgentConfigState {
    const sourceKey = createSourceKey(status, ready)
    const client = useMemo(
        () => (ready ? createClient(status) : null),
        [ready, status?.hubOwnerToken, status?.localHubUrl]
    )
    const [response, setResponse] = useState<AgentConfigResponse | null>(null)
    const [error, setError] = useState<AgentConfigErrorCode | null>(null)
    const [loading, setLoading] = useState(false)
    const [savingDriver, setSavingDriver] = useState<AgentConfigDriver | null>(null)
    const [restoringDriver, setRestoringDriver] = useState<AgentConfigDriver | null>(null)
    const [loadedSourceKey, setLoadedSourceKey] = useState<string | null>(null)
    const requestRef = useRef(0)

    const load = useCallback((): void => {
        if (!client) {
            setError('hub_unavailable')
            return
        }
        const requestId = requestRef.current + 1
        requestRef.current = requestId
        setLoading(true)
        setError(null)
        void client
            .getAgentConfig()
            .then((nextResponse) => {
                if (requestRef.current !== requestId) return
                setResponse(nextResponse)
                setLoadedSourceKey(sourceKey)
            })
            .catch(() => {
                if (requestRef.current === requestId) setError('load_failed')
            })
            .finally(() => {
                if (requestRef.current === requestId) setLoading(false)
            })
    }, [client, sourceKey])

    const save = useCallback(
        async (request: SaveAgentConfigRequest): Promise<AgentConfigFileState | null> => {
            if (!client) {
                setError('hub_unavailable')
                return null
            }
            setSavingDriver(request.driver)
            setError(null)
            try {
                const result = await client.saveAgentConfig(request)
                setResponse((current) => ({
                    agents: [
                        ...(current?.agents.filter((agent) => agent.driver !== result.agent.driver) ?? []),
                        result.agent,
                    ],
                }))
                return result.agent
            } catch {
                setError('save_failed')
                return null
            } finally {
                setSavingDriver(null)
            }
        },
        [client]
    )

    const restore = useCallback(
        async (request: RestoreAgentConfigRequest): Promise<AgentConfigFileState | null> => {
            if (!client) {
                setError('hub_unavailable')
                return null
            }
            setRestoringDriver(request.driver)
            setError(null)
            try {
                const result = await client.restoreAgentConfig(request)
                setResponse((current) => ({
                    agents: [
                        ...(current?.agents.filter((agent) => agent.driver !== result.agent.driver) ?? []),
                        result.agent,
                    ],
                }))
                return result.agent
            } catch {
                setError('save_failed')
                return null
            } finally {
                setRestoringDriver(null)
            }
        },
        [client]
    )

    useEffect(() => {
        requestRef.current += 1
        setResponse(null)
        setError(null)
        setLoading(false)
        setSavingDriver(null)
        setRestoringDriver(null)
        setLoadedSourceKey(null)
    }, [sourceKey])

    useEffect(() => {
        if (!enabled || loadedSourceKey === sourceKey) return
        load()
    }, [enabled, load, loadedSourceKey, sourceKey])

    return { response, error, loading, savingDriver, restoringDriver, load, save, restore }
}
