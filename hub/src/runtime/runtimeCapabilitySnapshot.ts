import {
    AGENT_FLAVORS,
    type AgentFlavor,
    type RuntimeCapabilityDepth,
    type RuntimeCapabilitySnapshot,
} from '@viby/protocol'

export type RuntimeScope = {
    key: string
    machineId: string
    directory: string | null
    agents: Map<AgentFlavor, AgentCacheEntry>
}
export type AgentCacheEntry = { availability?: AvailabilityValue; launchConfig?: LaunchConfigValue }
export type AvailabilityValue = Omit<RuntimeCapabilitySnapshot['agents'][number]['availability'], 'refreshing'>
export type LaunchConfigValue = Omit<RuntimeCapabilitySnapshot['agents'][number]['launchConfig'], 'refreshing'>
export type RuntimePendingReader = (driver: AgentFlavor, kind: RuntimeCapabilityDepth) => boolean

export function pendingKey(scope: RuntimeScope, driver: AgentFlavor, kind: RuntimeCapabilityDepth): string {
    return `${scope.key}:${kind}:${driver}`
}

export function buildRuntimeCapabilitySnapshot(
    scope: RuntimeScope,
    isPending: RuntimePendingReader
): RuntimeCapabilitySnapshot {
    const agents = AGENT_FLAVORS.map((driver) => {
        const entry = scope.agents.get(driver)
        return {
            driver,
            availability: {
                ...(entry?.availability ?? createEmptyAvailability(driver)),
                refreshing: isPending(driver, 'availability'),
            },
            launchConfig: {
                ...(entry?.launchConfig ?? createEmptyLaunchConfig(driver)),
                refreshing: isPending(driver, 'launch_config'),
            },
        }
    })

    return {
        machineId: scope.machineId,
        directory: scope.directory,
        agents,
        detectedAt: maxTime(agents.flatMap((agent) => [agent.availability.detectedAt, agent.launchConfig.detectedAt])),
        expiresAt: minTime(agents.flatMap((agent) => [agent.availability.expiresAt, agent.launchConfig.expiresAt])),
        refreshing: agents.some((agent) => agent.availability.refreshing || agent.launchConfig.refreshing),
        error: null,
    }
}

function createEmptyAvailability(driver: AgentFlavor): AvailabilityValue {
    return { driver, value: null, detectedAt: null, expiresAt: null, error: null }
}

function createEmptyLaunchConfig(agent: AgentFlavor): LaunchConfigValue {
    return { agent, config: null, detectedAt: null, expiresAt: null, error: null }
}

function maxTime(values: readonly (number | null)[]): number | null {
    const numbers = values.filter((value): value is number => typeof value === 'number')
    return numbers.length ? Math.max(...numbers) : null
}

function minTime(values: readonly (number | null)[]): number | null {
    const numbers = values.filter((value): value is number => typeof value === 'number')
    return numbers.length ? Math.min(...numbers) : null
}
