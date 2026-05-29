import type {
    AgentAvailability,
    AgentFlavor,
    AgentLaunchConfig,
    ModelReasoningEffort,
    RuntimeCapabilityError,
} from '@viby/protocol'
import { requiresAgentLaunchConfig } from '@viby/protocol'

export type RuntimeSpawnValidationOptions = {
    directory: string
    agent: AgentFlavor
    model?: string
    modelReasoningEffort?: ModelReasoningEffort | null
}

export type RuntimeSpawnValidationResult =
    | { ok: true }
    | { ok: false; status: 400 | 409; body: Record<string, unknown> }

export function getRuntimeCapabilityErrorMessage(code: RuntimeCapabilityError['code']): string {
    if (code === 'runtime_unavailable') return 'Local runtime is unavailable on this machine'
    if (code === 'rpc_unavailable') return 'Local runtime capability check is unavailable on this machine'
    if (code === 'command_missing') return 'Agent command is not installed on this machine'
    if (code === 'auth_missing') return 'Agent authentication is missing on this machine'
    if (code === 'config_missing') return 'Agent configuration is invalid on this machine'
    if (code === 'platform_unsupported') return 'Agent is unsupported on this platform'
    if (code === 'provider_unavailable') return 'Agent provider is unavailable on this machine'
    if (code === 'model_unavailable') return 'Selected model is not available for this agent'
    if (code === 'reasoning_unsupported') return 'Selected reasoning effort is not supported for this agent'
    return 'Agent launch configuration is unavailable on this machine'
}

export function rejectRuntimeCapability(
    code: string,
    status: 400 | 409,
    agent: AgentFlavor,
    availability: AgentAvailability | null,
    errorCode?: RuntimeCapabilityError['code']
): RuntimeSpawnValidationResult {
    return {
        ok: false,
        status,
        body: {
            error: getRuntimeCapabilityErrorMessage(errorCode ?? 'provider_unavailable'),
            code,
            agent,
            availability: redactAvailability(availability),
            capabilityErrorCode: errorCode ?? null,
        },
    }
}

export function requiresRuntimeLaunchConfig(options: RuntimeSpawnValidationOptions): boolean {
    return requiresAgentLaunchConfig(options)
}

export function validateRuntimeLaunchOptions(
    options: RuntimeSpawnValidationOptions,
    config: AgentLaunchConfig,
    availability: AgentAvailability
): RuntimeSpawnValidationResult {
    if (isModelRequested(options.model) && !config.availableModels.some((model) => model.id === options.model)) {
        return rejectRuntimeCapability('model_unavailable', 400, options.agent, availability, 'model_unavailable')
    }
    if (options.modelReasoningEffort && !supportsReasoning(config, options.model, options.modelReasoningEffort)) {
        return rejectRuntimeCapability(
            'reasoning_unsupported',
            400,
            options.agent,
            availability,
            'reasoning_unsupported'
        )
    }
    return { ok: true }
}

function redactAvailability(value: AgentAvailability | null | undefined): Record<string, unknown> | null {
    if (!value) return null
    const { reason: _reason, ...publicValue } = value
    return publicValue
}

function isModelRequested(model: string | null | undefined): model is string {
    return requiresAgentLaunchConfig({ agent: 'claude', model })
}

function supportsReasoning(
    config: AgentLaunchConfig,
    model: string | null | undefined,
    effort: ModelReasoningEffort
): boolean {
    const selected = model?.trim() || config.defaultModel?.trim() || ''
    const capability = selected ? config.availableModels.find((candidate) => candidate.id === selected) : null
    return capability
        ? capability.supportedThinkingLevels.includes(effort)
        : config.availableModels.some((candidate) => candidate.supportedThinkingLevels.includes(effort))
}
