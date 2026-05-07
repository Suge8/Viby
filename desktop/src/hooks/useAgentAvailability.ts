import {
    AGENT_FLAVORS,
    type AgentAvailability,
    type AgentFlavor,
    type RuntimeAgentCapabilitySnapshot,
} from '@viby/protocol'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LocalHubPairingClient } from '@/lib/localHubPairingClient'
import type { HubRuntimeStatus } from '@/types'

export type AgentAvailabilityErrorCode = 'check_failed' | 'hub_unavailable'

type AgentAvailabilityState = {
    agents: readonly AgentAvailability[]
    capabilities: readonly RuntimeAgentCapabilitySnapshot[]
    error: AgentAvailabilityErrorCode | null
    loading: boolean
    refreshing: boolean
    loadAgentCapability(driver: AgentFlavor): void
    refresh(): void
}

const AUTO_REFRESH_TTL_MS = 60_000
const REFRESHING_POLL_MS = 900

function createClient(status?: HubRuntimeStatus): LocalHubPairingClient | null {
    if (!status?.localHubUrl || !status.cliApiToken) return null
    return new LocalHubPairingClient({ baseUrl: status.localHubUrl, cliApiToken: status.cliApiToken })
}

function createSourceKey(status: HubRuntimeStatus | undefined, ready: boolean): string {
    return ready && status?.localHubUrl && status.cliApiToken
        ? `${status.localHubUrl}\0${status.cliApiToken}`
        : 'offline'
}

function toAvailability(agents: readonly RuntimeAgentCapabilitySnapshot[]): readonly AgentAvailability[] {
    return agents.flatMap((agent) => (agent.availability.value ? [agent.availability.value] : []))
}

function mergeCapability(
    current: readonly RuntimeAgentCapabilitySnapshot[],
    next: RuntimeAgentCapabilitySnapshot
): readonly RuntimeAgentCapabilitySnapshot[] {
    const byDriver = new Map(current.map((agent) => [agent.driver, agent]))
    byDriver.set(next.driver, next)
    return AGENT_FLAVORS.flatMap((driver) => {
        const capability = byDriver.get(driver)
        return capability ? [capability] : []
    })
}

export function useAgentAvailability(
    status: HubRuntimeStatus | undefined,
    ready: boolean,
    enabled: boolean
): AgentAvailabilityState {
    const sourceKey = createSourceKey(status, ready)
    const client = useMemo(
        () => (ready ? createClient(status) : null),
        [ready, status?.cliApiToken, status?.localHubUrl]
    )
    const [agents, setAgents] = useState<readonly AgentAvailability[]>([])
    const [capabilities, setCapabilities] = useState<readonly RuntimeAgentCapabilitySnapshot[]>([])
    const [error, setError] = useState<AgentAvailabilityErrorCode | null>(null)
    const [loading, setLoading] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [lastLoadedAt, setLastLoadedAt] = useState(0)
    const [loadedSourceKey, setLoadedSourceKey] = useState<string | null>(null)
    const requestRef = useRef(0)

    const load = useCallback(
        async (forceRefresh: boolean): Promise<void> => {
            if (!client) {
                setError('hub_unavailable')
                return
            }
            const requestId = requestRef.current + 1
            requestRef.current = requestId
            setLoading(true)
            setError(null)
            try {
                const response = await client.getRuntimeCapabilities({
                    depth: 'availability',
                    ...(forceRefresh ? { forceRefresh: true } : {}),
                })
                if (requestRef.current !== requestId) return
                setAgents(toAvailability(response.snapshot.agents))
                setCapabilities(response.snapshot.agents)
                setRefreshing(response.snapshot.refreshing)
                setLoadedSourceKey(sourceKey)
                setLastLoadedAt(Date.now())
            } catch {
                if (requestRef.current === requestId) {
                    setRefreshing(false)
                    setError('check_failed')
                }
            } finally {
                if (requestRef.current === requestId) setLoading(false)
            }
        },
        [client, sourceKey]
    )

    const loadAgentCapability = useCallback(
        (driver: AgentFlavor): void => {
            if (!client) return
            const requestId = requestRef.current
            const poll = async (): Promise<void> => {
                try {
                    const response = await client.getRuntimeCapabilities({ depth: 'launch_config', drivers: [driver] })
                    if (requestRef.current !== requestId) return
                    const next = response.snapshot.agents.find((agent) => agent.driver === driver)
                    if (!next) return
                    setCapabilities((current) => mergeCapability(current, next))
                    if (next.launchConfig.refreshing) window.setTimeout(() => void poll(), REFRESHING_POLL_MS)
                } catch {
                    if (requestRef.current === requestId) setError('check_failed')
                }
            }
            void poll()
        },
        [client]
    )

    const refresh = useCallback(() => {
        void load(true)
    }, [load])

    useEffect(() => {
        requestRef.current += 1
        setAgents([])
        setCapabilities([])
        setError(null)
        setLoading(false)
        setRefreshing(false)
        setLastLoadedAt(0)
        setLoadedSourceKey(null)
    }, [sourceKey])

    useEffect(() => {
        if (!enabled) return
        const fresh = loadedSourceKey === sourceKey && Date.now() - lastLoadedAt < AUTO_REFRESH_TTL_MS
        if (fresh) return
        void load(false)
    }, [enabled, lastLoadedAt, load, loadedSourceKey, sourceKey])

    useEffect(() => {
        if (!enabled || !refreshing) return
        const timer = window.setTimeout(() => void load(false), REFRESHING_POLL_MS)
        return () => window.clearTimeout(timer)
    }, [enabled, load, refreshing])

    return { agents, capabilities, error, loading, refreshing, loadAgentCapability, refresh }
}
