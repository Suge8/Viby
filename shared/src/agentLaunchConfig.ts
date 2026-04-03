import { z } from 'zod'
import {
    ModelReasoningEffortSchema,
    PiModelCapabilitySchema,
    SessionDriverSchema
} from './schemas'

export const ResolveAgentLaunchConfigRequestSchema = z.object({
    agent: SessionDriverSchema,
    directory: z.string().trim().min(1)
})

export type ResolveAgentLaunchConfigRequest = z.infer<typeof ResolveAgentLaunchConfigRequestSchema>

export const AgentLaunchConfigSchema = z.object({
    agent: SessionDriverSchema,
    defaultModel: z.string().nullable(),
    defaultModelReasoningEffort: ModelReasoningEffortSchema.nullable(),
    availableModels: z.array(PiModelCapabilitySchema)
})

export type AgentLaunchConfig = z.infer<typeof AgentLaunchConfigSchema>

export const ResolveAgentLaunchConfigResponseSchema = z.union([
    z.object({
        type: z.literal('success'),
        config: AgentLaunchConfigSchema
    }),
    z.object({
        type: z.literal('error'),
        message: z.string()
    })
])

export type ResolveAgentLaunchConfigResponse = z.infer<typeof ResolveAgentLaunchConfigResponseSchema>
