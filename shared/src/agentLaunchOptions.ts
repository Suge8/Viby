import { z } from 'zod'
import { type AgentAvailability, isAgentAvailabilityReady } from './agentAvailability'
import { type AgentLaunchConfig, AgentLaunchConfigSchema, type AgentModelCapability } from './agentLaunchConfig'
import { AGENT_FLAVORS } from './modes'
import { ModelReasoningEffortSchema, SessionDriverSchema } from './schemas'

export const NEW_SESSION_AGENT_UNAVAILABLE_REASONS = [
    'agent_unavailable',
    'missing_model_options',
    'launch_config_error',
] as const

export const AgentLaunchOptionSchema = z.object({ value: z.string(), label: z.string() })
export const AgentLaunchSelectionSchema = z.object({
    model: z.string(),
    modelReasoningEffort: ModelReasoningEffortSchema.nullable(),
})
export const NewSessionAgentUnavailableReasonSchema = z.enum(NEW_SESSION_AGENT_UNAVAILABLE_REASONS)
export const NewSessionSelectableAgentSchema = z.object({
    agent: SessionDriverSchema,
    modelOptions: z.array(AgentLaunchOptionSchema),
    reasoningOptionsByModel: z.record(z.string(), z.array(AgentLaunchOptionSchema)),
})
export const NewSessionAgentLaunchOptionsSchema = z.object({
    modelOptions: z.array(AgentLaunchOptionSchema),
    reasoningOptions: z.array(AgentLaunchOptionSchema),
    selection: AgentLaunchSelectionSchema,
})
export const NewSessionAgentLaunchProjectionSchema = z.object({
    agents: z.array(NewSessionSelectableAgentSchema),
    unavailable: z.partialRecord(SessionDriverSchema, NewSessionAgentUnavailableReasonSchema),
})
export const RuntimeAgentLaunchOptionsRequestSchema = z.object({
    directory: z.string().trim().min(1).optional(),
    refresh: z.preprocess((value) => {
        if (value === '1' || value === 'true') return true
        if (value === '0' || value === 'false') return false
        return value
    }, z.boolean().optional()),
})
export const RuntimeAgentLaunchOptionsResponseSchema = z.object({
    projection: NewSessionAgentLaunchProjectionSchema,
})

export type AgentLaunchOption = z.infer<typeof AgentLaunchOptionSchema>
export type AgentLaunchSelection = z.infer<typeof AgentLaunchSelectionSchema>
export type NewSessionAgentUnavailableReason = z.infer<typeof NewSessionAgentUnavailableReasonSchema>
export type NewSessionSelectableAgent = z.infer<typeof NewSessionSelectableAgentSchema>
export type NewSessionAgentLaunchOptions = z.infer<typeof NewSessionAgentLaunchOptionsSchema>
export type NewSessionAgentLaunchProjection = z.infer<typeof NewSessionAgentLaunchProjectionSchema>
export type RuntimeAgentLaunchOptionsRequest = z.infer<typeof RuntimeAgentLaunchOptionsRequestSchema>
export type RuntimeAgentLaunchOptionsResponse = z.infer<typeof RuntimeAgentLaunchOptionsResponseSchema>

export type RuntimeAgentLaunchOptionSource = {
    agent: (typeof AGENT_FLAVORS)[number]
    availability: AgentAvailability | null
    config?: AgentLaunchConfig | null
    launchConfigError?: boolean
}

function uniqueCapabilities(capabilities: readonly AgentModelCapability[]): AgentModelCapability[] {
    const seenModels = new Set<string>()
    return capabilities.flatMap((capability) => {
        const id = capability.id.trim()
        if (!id || id === 'auto' || id === 'default' || seenModels.has(id)) return []
        seenModels.add(id)
        return [
            {
                id,
                label: capability.label.trim() || id,
                supportedThinkingLevels: uniqueReasoning(capability.supportedThinkingLevels),
            },
        ]
    })
}

function uniqueReasoning(
    efforts: readonly AgentModelCapability['supportedThinkingLevels'][number][]
): AgentModelCapability['supportedThinkingLevels'] {
    const seen = new Set<string>()
    return efforts.filter((effort) => {
        if (seen.has(effort)) return false
        seen.add(effort)
        return true
    })
}

function toModelOptions(capabilities: readonly AgentModelCapability[]): AgentLaunchOption[] {
    return capabilities.map((capability) => ({ value: capability.id, label: capability.label || capability.id }))
}

function toReasoningOptions(capability: AgentModelCapability | undefined): AgentLaunchOption[] {
    return (capability?.supportedThinkingLevels ?? []).map((effort) => ({ value: effort, label: effort }))
}

export function buildSelectableAgentLaunchOptions(config: AgentLaunchConfig): NewSessionSelectableAgent | null {
    const capabilities = uniqueCapabilities(config.availableModels)
    if (capabilities.length === 0) return null

    return {
        agent: config.agent,
        modelOptions: toModelOptions(capabilities),
        reasoningOptionsByModel: Object.fromEntries(
            capabilities.map((capability) => [capability.id, toReasoningOptions(capability)])
        ),
    }
}

export function resolveAgentLaunchOptions(
    agent: NewSessionSelectableAgent,
    currentSelection: Partial<AgentLaunchSelection>
): NewSessionAgentLaunchOptions {
    const selectedModel = agent.modelOptions.some((option) => option.value === currentSelection.model)
        ? currentSelection.model
        : agent.modelOptions[0]?.value

    if (!selectedModel) {
        throw new Error(`Missing model options for ${agent.agent}`)
    }

    const reasoningOptions = agent.reasoningOptionsByModel[selectedModel] ?? []
    const selectedReasoning: AgentLaunchSelection['modelReasoningEffort'] = reasoningOptions.some(
        (option) => option.value === currentSelection.modelReasoningEffort
    )
        ? (currentSelection.modelReasoningEffort ?? null)
        : ((reasoningOptions[0]?.value as AgentLaunchSelection['modelReasoningEffort']) ?? null)

    return {
        modelOptions: agent.modelOptions,
        reasoningOptions,
        selection: {
            model: selectedModel,
            modelReasoningEffort: selectedReasoning,
        },
    }
}

export function buildNewSessionAgentLaunchProjection(
    sources: readonly RuntimeAgentLaunchOptionSource[]
): NewSessionAgentLaunchProjection {
    const agents: NewSessionSelectableAgent[] = []
    const unavailable: Partial<Record<(typeof AGENT_FLAVORS)[number], NewSessionAgentUnavailableReason>> = {}

    for (const source of sources) {
        if (!isAgentAvailabilityReady(source.availability)) {
            unavailable[source.agent] = 'agent_unavailable'
            continue
        }

        if (source.launchConfigError || !source.config) {
            unavailable[source.agent] = 'launch_config_error'
            continue
        }

        const selectable = buildSelectableAgentLaunchOptions(source.config)
        if (!selectable) {
            unavailable[source.agent] = 'missing_model_options'
            continue
        }

        agents.push(selectable)
    }

    return { agents, unavailable }
}

export function assertAgentLaunchConfig(value: unknown): AgentLaunchConfig {
    return AgentLaunchConfigSchema.parse(value)
}
