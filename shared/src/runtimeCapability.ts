import { z } from 'zod'
import { AgentAvailabilitySchema } from './agentAvailability'
import { AgentLaunchConfigSchema } from './agentLaunchConfig'
import { AGENT_FLAVORS } from './modes'
import { SessionDriverSchema } from './schemas'

export const RUNTIME_CAPABILITY_DEPTHS = ['availability', 'launch_config'] as const
export const RUNTIME_CAPABILITY_ERROR_CODES = [
    'runtime_unavailable',
    'rpc_unavailable',
    'command_missing',
    'auth_missing',
    'config_missing',
    'platform_unsupported',
    'provider_unavailable',
    'model_unavailable',
    'reasoning_unsupported',
    'unknown',
] as const

export const RuntimeCapabilityDepthSchema = z.enum(RUNTIME_CAPABILITY_DEPTHS)
export const RuntimeCapabilityErrorCodeSchema = z.enum(RUNTIME_CAPABILITY_ERROR_CODES)

const QueryBooleanSchema = z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')

const QueryAgentDriversSchema = z
    .preprocess((value) => {
        if (typeof value !== 'string') return value
        return value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
    }, z.array(SessionDriverSchema).min(1).optional())
    .transform((drivers) => (drivers ? AGENT_FLAVORS.filter((driver) => drivers.includes(driver)) : undefined))

export const RuntimeCapabilityErrorSchema = z.object({
    code: RuntimeCapabilityErrorCodeSchema,
    detectedAt: z.number().int().nonnegative(),
})

export const RuntimeAgentAvailabilitySnapshotSchema = z.object({
    driver: SessionDriverSchema,
    value: AgentAvailabilitySchema.nullable(),
    detectedAt: z.number().int().nonnegative().nullable(),
    expiresAt: z.number().int().nonnegative().nullable(),
    refreshing: z.boolean(),
    error: RuntimeCapabilityErrorSchema.nullable(),
})

export const RuntimeAgentLaunchConfigSnapshotSchema = z.object({
    agent: SessionDriverSchema,
    config: AgentLaunchConfigSchema.nullable(),
    detectedAt: z.number().int().nonnegative().nullable(),
    expiresAt: z.number().int().nonnegative().nullable(),
    refreshing: z.boolean(),
    error: RuntimeCapabilityErrorSchema.nullable(),
})

export const RuntimeAgentCapabilitySnapshotSchema = z.object({
    driver: SessionDriverSchema,
    availability: RuntimeAgentAvailabilitySnapshotSchema,
    launchConfig: RuntimeAgentLaunchConfigSnapshotSchema,
})

export const RuntimeCapabilitySnapshotSchema = z.object({
    machineId: z.string().min(1),
    directory: z.string().min(1).nullable(),
    agents: z.array(RuntimeAgentCapabilitySnapshotSchema),
    detectedAt: z.number().int().nonnegative().nullable(),
    expiresAt: z.number().int().nonnegative().nullable(),
    refreshing: z.boolean(),
    error: RuntimeCapabilityErrorSchema.nullable(),
})

export const RuntimeCapabilityRequestSchema = z.object({
    directory: z.string().trim().min(1).optional(),
    forceRefresh: QueryBooleanSchema.optional(),
    drivers: QueryAgentDriversSchema.optional(),
    depth: RuntimeCapabilityDepthSchema.optional().default('availability'),
})

export const RuntimeCapabilityResponseSchema = z.object({
    snapshot: RuntimeCapabilitySnapshotSchema,
})

export type RuntimeCapabilityDepth = z.infer<typeof RuntimeCapabilityDepthSchema>
export type RuntimeCapabilityErrorCode = z.infer<typeof RuntimeCapabilityErrorCodeSchema>
export type RuntimeCapabilityError = z.infer<typeof RuntimeCapabilityErrorSchema>
export type RuntimeAgentAvailabilitySnapshot = z.infer<typeof RuntimeAgentAvailabilitySnapshotSchema>
export type RuntimeAgentLaunchConfigSnapshot = z.infer<typeof RuntimeAgentLaunchConfigSnapshotSchema>
export type RuntimeAgentCapabilitySnapshot = z.infer<typeof RuntimeAgentCapabilitySnapshotSchema>
export type RuntimeCapabilitySnapshot = z.infer<typeof RuntimeCapabilitySnapshotSchema>
export type RuntimeCapabilityRequest = z.infer<typeof RuntimeCapabilityRequestSchema>
export type RuntimeCapabilityResponse = z.infer<typeof RuntimeCapabilityResponseSchema>
