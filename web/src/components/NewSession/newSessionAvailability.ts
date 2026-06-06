import type { NewSessionAgentLaunchProjection } from '@viby/protocol'
import type { AgentType } from './types'

export type EffectiveAgentSelection = {
    rawAgent: AgentType
    effectiveAgent: AgentType
    rawAgentUnavailable: boolean
    hasFallback: boolean
}

export function resolveEffectiveAgentSelection(
    rawAgent: AgentType,
    projection: NewSessionAgentLaunchProjection
): EffectiveAgentSelection {
    const rawAgentSelectable = projection.agents.some((entry) => entry.agent === rawAgent)
    if (rawAgentSelectable) {
        return { rawAgent, effectiveAgent: rawAgent, rawAgentUnavailable: false, hasFallback: false }
    }

    const fallbackAgent = projection.agents[0]?.agent ?? rawAgent
    return {
        rawAgent,
        effectiveAgent: fallbackAgent,
        rawAgentUnavailable: Boolean(projection.unavailable[rawAgent]),
        hasFallback: fallbackAgent !== rawAgent,
    }
}

export function isEffectiveAgentReady(
    selection: EffectiveAgentSelection,
    projection: NewSessionAgentLaunchProjection
): boolean {
    return projection.agents.some((entry) => entry.agent === selection.effectiveAgent)
}
