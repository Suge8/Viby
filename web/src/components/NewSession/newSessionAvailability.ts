import { type AgentAvailability, findFirstReadyAgent, isAgentAvailabilityReady } from '@viby/protocol'
import { type AgentLaunchPreferences, getDefaultAgentLaunchPreferences } from './preferences'
import type { AgentType, ModelReasoningEffortSelection } from './types'

export type EffectiveAgentSelection = {
    rawAgent: AgentType
    effectiveAgent: AgentType
    rawAgentAvailability: AgentAvailability | null
    effectiveAgentAvailability: AgentAvailability | null
    hasFallback: boolean
}

export function resolveEffectiveAgentSelection(
    rawAgent: AgentType,
    availability: readonly AgentAvailability[]
): EffectiveAgentSelection {
    const availabilityByDriver = new Map(availability.map((entry) => [entry.driver, entry]))
    const rawAgentAvailability = availabilityByDriver.get(rawAgent) ?? null
    if (isAgentAvailabilityReady(rawAgentAvailability)) {
        return {
            rawAgent,
            effectiveAgent: rawAgent,
            rawAgentAvailability,
            effectiveAgentAvailability: rawAgentAvailability,
            hasFallback: false,
        }
    }

    const fallbackAgent = findFirstReadyAgent(availability)
    const effectiveAgent = (fallbackAgent ?? rawAgent) as AgentType
    return {
        rawAgent,
        effectiveAgent,
        rawAgentAvailability,
        effectiveAgentAvailability: availabilityByDriver.get(effectiveAgent) ?? null,
        hasFallback: Boolean(fallbackAgent && fallbackAgent !== rawAgent),
    }
}

export function resolveEffectiveAgentLaunchPreferences(
    effectiveAgent: AgentType,
    currentAgent: AgentType,
    currentPreferences: AgentLaunchPreferences,
    getAgentPreferences: (agent: AgentType) => AgentLaunchPreferences
): AgentLaunchPreferences {
    if (effectiveAgent === currentAgent) {
        return currentPreferences
    }

    return getAgentPreferences(effectiveAgent) ?? getDefaultAgentLaunchPreferences(effectiveAgent)
}

export function isEffectiveAgentReady(availability: AgentAvailability | null | undefined): boolean {
    return isAgentAvailabilityReady(availability)
}

export function toEffectiveModelReasoningEffort(preferences: AgentLaunchPreferences): ModelReasoningEffortSelection {
    return preferences.modelReasoningEffort
}
