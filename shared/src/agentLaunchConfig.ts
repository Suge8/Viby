import { z } from 'zod'
import { ModelReasoningEffortSchema, SessionDriverSchema } from './schemas'

export const AGENT_LAUNCH_CONFIG_ERROR_CODES = [
    'auth_missing',
    'config_missing',
    'provider_unavailable',
    'model_unavailable',
    'reasoning_unsupported',
    'unknown',
] as const

export const AgentLaunchConfigErrorCodeSchema = z.enum(AGENT_LAUNCH_CONFIG_ERROR_CODES)
export type AgentLaunchConfigErrorCode = z.infer<typeof AgentLaunchConfigErrorCodeSchema>

export const ResolveAgentLaunchConfigRequestSchema = z.object({
    agent: SessionDriverSchema,
    directory: z.string().trim().min(1).optional(),
})

export type ResolveAgentLaunchConfigRequest = z.infer<typeof ResolveAgentLaunchConfigRequestSchema>

export const AgentModelCapabilitySchema = z.object({
    id: z.string(),
    label: z.string(),
    supportedThinkingLevels: z.array(ModelReasoningEffortSchema),
})

export type AgentModelCapability = z.infer<typeof AgentModelCapabilitySchema>

export const AgentLaunchConfigSchema = z.object({
    agent: SessionDriverSchema,
    availableModels: z.array(AgentModelCapabilitySchema),
})

export type AgentLaunchConfig = z.infer<typeof AgentLaunchConfigSchema>

export function requiresAgentLaunchConfig(options: {
    agent: z.infer<typeof SessionDriverSchema>
    model?: string | null
    modelReasoningEffort?: z.infer<typeof ModelReasoningEffortSchema> | null
}): boolean {
    return options.agent === 'pi' || isModelOverride(options.model) || Boolean(options.modelReasoningEffort)
}

function isModelOverride(model: string | null | undefined): boolean {
    return Boolean(model?.trim())
}

export const ResolveAgentLaunchConfigResponseSchema = z.union([
    z.object({
        type: z.literal('success'),
        config: AgentLaunchConfigSchema,
    }),
    z.object({
        type: z.literal('error'),
        code: AgentLaunchConfigErrorCodeSchema.default('unknown'),
        message: z.string(),
    }),
])

export type ResolveAgentLaunchConfigResponse = z.infer<typeof ResolveAgentLaunchConfigResponseSchema>
