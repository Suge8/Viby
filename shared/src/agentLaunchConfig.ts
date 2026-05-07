import { z } from 'zod'
import { ModelReasoningEffortSchema, SessionDriverSchema } from './schemas'

export const ResolveAgentLaunchConfigRequestSchema = z.object({
    agent: SessionDriverSchema,
    directory: z.string().trim().min(1),
})

export type ResolveAgentLaunchConfigRequest = z.infer<typeof ResolveAgentLaunchConfigRequestSchema>

export const AgentModelCapabilitySchema = z.object({
    id: z.string(),
    label: z.string(),
    supportedThinkingLevels: z.array(ModelReasoningEffortSchema),
    defaultThinkingLevel: ModelReasoningEffortSchema.optional(),
})

export type AgentModelCapability = z.infer<typeof AgentModelCapabilitySchema>

export const AgentLaunchConfigSchema = z.object({
    agent: SessionDriverSchema,
    defaultModel: z.string().nullable(),
    defaultModelReasoningEffort: ModelReasoningEffortSchema.nullable(),
    availableModels: z.array(AgentModelCapabilitySchema),
})

export type AgentLaunchConfig = z.infer<typeof AgentLaunchConfigSchema>

export const ResolveAgentLaunchConfigResponseSchema = z.union([
    z.object({
        type: z.literal('success'),
        config: AgentLaunchConfigSchema,
    }),
    z.object({
        type: z.literal('error'),
        message: z.string(),
    }),
])

export type ResolveAgentLaunchConfigResponse = z.infer<typeof ResolveAgentLaunchConfigResponseSchema>
