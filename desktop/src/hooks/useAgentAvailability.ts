import type { AgentAvailability, AgentAvailabilityResponse, ListAgentAvailabilityRequest } from '@viby/protocol'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listAgentAvailability } from '@/lib/desktopApi'
import { LocalHubPairingClient } from '@/lib/localHubPairingClient'
import type { HubRuntimeStatus } from '@/types'

type AgentAvailabilityState = {
    agents: readonly AgentAvailability[]
    error: string | null
    loading: boolean
    refresh(): void
}

function createClient(status?: HubRuntimeStatus): LocalHubPairingClient | null {
    if (!status?.localHubUrl || !status.cliApiToken) {
        return null
    }
    return new LocalHubPairingClient({ baseUrl: status.localHubUrl, cliApiToken: status.cliApiToken })
}

async function loadAgentAvailability(
    client: LocalHubPairingClient | null,
    request: ListAgentAvailabilityRequest
): Promise<AgentAvailabilityResponse> {
    return client ? await client.getRuntimeAgentAvailability(request) : await listAgentAvailability(request)
}

export function useAgentAvailability(status: HubRuntimeStatus | undefined, ready: boolean): AgentAvailabilityState {
    const client = useMemo(() => (ready ? createClient(status) : null), [ready, status])
    const [agents, setAgents] = useState<readonly AgentAvailability[]>([])
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [refreshNonce, setRefreshNonce] = useState(0)

    const refresh = useCallback(() => setRefreshNonce((value) => value + 1), [])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)

        loadAgentAvailability(client, { forceRefresh: refreshNonce > 0 })
            .then((response) => {
                if (!cancelled) {
                    setAgents(response.agents)
                }
            })
            .catch((reason: unknown) => {
                if (!cancelled) {
                    setError(reason instanceof Error ? reason.message : '无法检测 Coding Agents。')
                    setAgents([])
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [client, refreshNonce])

    return { agents, error, loading, refresh }
}
