import { z } from 'zod'
import {
    TeamMemberIsolationModeSchema,
    TeamMemberRolePrototypeSchema,
    TeamProjectPresetSchema,
    TeamProviderFlavorSchema,
    TeamProjectIsolationModeSchema,
    TeamReasoningEffortSchema,
    TeamRoleIdSchema,
} from '@viby/protocol'

export const interjectBodySchema = z.object({
    text: z.string().trim().min(1),
    localId: z.string().min(1).optional(),
})

export const reviewRequestBodySchema = z.object({
    managerSessionId: z.string().min(1),
    reviewerMemberId: z.string().min(1),
    note: z.string().trim().min(1).optional(),
})

export const reviewResultBodySchema = z.object({
    memberId: z.string().min(1),
    decision: z.enum(['accept', 'request_changes']),
    summary: z.string().trim().min(1),
})

export const verificationRequestBodySchema = z.object({
    managerSessionId: z.string().min(1),
    verifierMemberId: z.string().min(1),
    note: z.string().trim().min(1).optional(),
})

export const verificationResultBodySchema = z.object({
    memberId: z.string().min(1),
    decision: z.enum(['pass', 'fail']),
    summary: z.string().trim().min(1),
})

export const acceptTaskBodySchema = z.object({
    managerSessionId: z.string().min(1),
    summary: z.string().trim().min(1).optional(),
    skipVerificationReason: z.string().trim().min(1).optional(),
})

const mutableTaskStatusSchema = z.enum([
    'todo',
    'running',
    'blocked',
    'canceled',
    'failed',
])

const teamMessageKindSchema = z.enum(['task-assign', 'follow-up', 'coordination'])

const teamRoleSettingsSchema = {
    providerFlavor: TeamProviderFlavorSchema.optional(),
    model: z.string().trim().min(1).nullable().optional(),
    reasoningEffort: TeamReasoningEffortSchema.nullish(),
    isolationMode: TeamMemberIsolationModeSchema.optional(),
} as const

export const spawnMemberBodySchema = z.object({
    managerSessionId: z.string().min(1),
    roleId: TeamRoleIdSchema,
    providerFlavor: TeamProviderFlavorSchema.nullish(),
    model: z.string().trim().min(1).nullable().optional(),
    reasoningEffort: TeamReasoningEffortSchema.nullish(),
    isolationMode: TeamMemberIsolationModeSchema.optional(),
    taskId: z.string().min(1).optional(),
    instruction: z.string().trim().min(1).optional(),
    contextTrusted: z.boolean().optional(),
    workspaceTrusted: z.boolean().optional(),
    requireFreshPerspective: z.boolean().optional(),
    permissionMode: z.enum(['default', 'read-only', 'safe-yolo', 'yolo']).optional(),
    collaborationMode: z.enum(['default', 'plan']).optional(),
    taskGoal: z.string().trim().min(1).optional(),
    artifactSummary: z.string().trim().min(1).optional(),
    attemptSummary: z.string().trim().min(1).optional(),
    failureSummary: z.string().trim().min(1).optional(),
    reviewSummary: z.string().trim().min(1).optional(),
    filePointers: z.array(z.string().trim().min(1)).optional(),
})

export const updateMemberBodySchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('remove'),
        managerSessionId: z.string().min(1),
    }),
    z.object({
        action: z.literal('replace'),
        managerSessionId: z.string().min(1),
        providerFlavor: TeamProviderFlavorSchema.nullish(),
        model: z.string().trim().min(1).nullable().optional(),
        reasoningEffort: TeamReasoningEffortSchema.nullish(),
        isolationMode: TeamMemberIsolationModeSchema.optional(),
        taskId: z.string().min(1).optional(),
        instruction: z.string().trim().min(1).optional(),
        contextTrusted: z.boolean().optional(),
        workspaceTrusted: z.boolean().optional(),
        requireFreshPerspective: z.boolean().optional(),
        permissionMode: z.enum(['default', 'read-only', 'safe-yolo', 'yolo']).optional(),
        collaborationMode: z.enum(['default', 'plan']).optional(),
        taskGoal: z.string().trim().min(1).optional(),
        artifactSummary: z.string().trim().min(1).optional(),
        attemptSummary: z.string().trim().min(1).optional(),
        failureSummary: z.string().trim().min(1).optional(),
        reviewSummary: z.string().trim().min(1).optional(),
        filePointers: z.array(z.string().trim().min(1)).optional(),
    }),
])

export const createRoleBodySchema = z.object({
    managerSessionId: z.string().min(1),
    roleId: TeamRoleIdSchema,
    prototype: TeamMemberRolePrototypeSchema,
    name: z.string().trim().min(1),
    promptExtension: z.string().trim().min(1).nullable().optional(),
    ...teamRoleSettingsSchema,
})

function hasRolePatch(body: z.infer<typeof updateRoleBodySchema>): boolean {
    return body.name !== undefined
        || body.promptExtension !== undefined
        || body.providerFlavor !== undefined
        || body.model !== undefined
        || body.reasoningEffort !== undefined
        || body.isolationMode !== undefined
}

export const updateRoleBodySchema = z.object({
    managerSessionId: z.string().min(1),
    name: z.string().trim().min(1).optional(),
    promptExtension: z.string().trim().min(1).nullable().optional(),
    ...teamRoleSettingsSchema,
}).refine(hasRolePatch, {
    message: 'At least one role field must be provided',
})

export const deleteRoleBodySchema = z.object({
    managerSessionId: z.string().min(1),
})

export const createTaskBodySchema = z.object({
    managerSessionId: z.string().min(1),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).nullable().optional(),
    acceptanceCriteria: z.string().trim().min(1).nullable().optional(),
    parentTaskId: z.string().min(1).optional(),
    status: mutableTaskStatusSchema.optional(),
    assigneeMemberId: z.string().min(1).optional(),
    reviewerMemberId: z.string().min(1).optional(),
    verifierMemberId: z.string().min(1).optional(),
    priority: z.string().trim().min(1).nullable().optional(),
    dependsOn: z.array(z.string().min(1)).optional(),
    note: z.string().trim().min(1).optional(),
})

export const updateTaskBodySchema = z.object({
    managerSessionId: z.string().min(1),
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).nullable().optional(),
    acceptanceCriteria: z.string().trim().min(1).nullable().optional(),
    status: mutableTaskStatusSchema.optional(),
    assigneeMemberId: z.string().min(1).nullable().optional(),
    reviewerMemberId: z.string().min(1).nullable().optional(),
    verifierMemberId: z.string().min(1).nullable().optional(),
    priority: z.string().trim().min(1).nullable().optional(),
    dependsOn: z.array(z.string().min(1)).optional(),
    note: z.string().trim().min(1).optional(),
})

export const messageMemberBodySchema = z.object({
    managerSessionId: z.string().min(1),
    text: z.string().trim().min(1),
    kind: teamMessageKindSchema.optional(),
})

export const closeProjectBodySchema = z.object({
    managerSessionId: z.string().min(1),
    summary: z.string().trim().min(1).optional(),
})

export const updateProjectSettingsBodySchema = z.object({
    managerSessionId: z.string().min(1),
    maxActiveMembers: z.number().int().positive(),
    defaultIsolationMode: TeamProjectIsolationModeSchema,
})

export const applyPresetBodySchema = z.object({
    managerSessionId: z.string().min(1),
    preset: TeamProjectPresetSchema,
})
