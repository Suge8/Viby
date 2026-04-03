import { z } from 'zod'
import {
    TeamMemberIsolationModeSchema,
    TeamMemberRolePrototypeSchema,
    TeamProviderFlavorSchema,
    TeamReasoningEffortSchema,
    TeamRoleIdSchema,
} from '@viby/protocol'

export const EMPTY_INPUT_SCHEMA = z.object({})

export const CHANGE_TITLE_INPUT_SCHEMA = z.object({
    title: z.string().trim().min(1).describe('The new title for the current chat session')
})

const teamRoleSettingsSchema = {
    providerFlavor: TeamProviderFlavorSchema.optional(),
    model: z.string().trim().min(1).nullable().optional(),
    reasoningEffort: TeamReasoningEffortSchema.nullish(),
    isolationMode: TeamMemberIsolationModeSchema.optional(),
} as const

export const SPAWN_MEMBER_INPUT_SCHEMA = z.object({
    roleId: TeamRoleIdSchema.describe('The authoritative role id to recruit'),
    providerFlavor: TeamProviderFlavorSchema.nullish().optional()
        .describe('Optional provider override; omit to use the role catalog default or the latest compatible lineage'),
    model: z.string().trim().min(1).nullable().optional()
        .describe('Optional model override for the new or revised member'),
    reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).nullable().optional()
        .describe('Optional reasoning effort override'),
    isolationMode: z.enum(['simple', 'worktree']).optional()
        .describe('Optional isolation override'),
    taskId: z.string().min(1).optional()
        .describe('Optional open task id that this member should immediately continue'),
    instruction: z.string().trim().min(1).optional()
        .describe('Optional first instruction for the recruited member'),
    requireFreshPerspective: z.boolean().optional()
        .describe('Force a fresh revision instead of resuming a compatible prior member'),
    taskGoal: z.string().trim().min(1).optional()
        .describe('Optional compact task goal for revision carryover'),
    artifactSummary: z.string().trim().min(1).optional()
        .describe('Optional artifact summary for revision carryover'),
    attemptSummary: z.string().trim().min(1).optional()
        .describe('Optional attempt summary for revision carryover'),
    failureSummary: z.string().trim().min(1).optional()
        .describe('Optional failure summary for revision carryover'),
    reviewSummary: z.string().trim().min(1).optional()
        .describe('Optional review or verification summary for revision carryover'),
    filePointers: z.array(z.string().trim().min(1)).optional()
        .describe('Optional important file pointers for revision carryover')
})

export const CREATE_ROLE_INPUT_SCHEMA = z.object({
    roleId: TeamRoleIdSchema.describe('The new authoritative custom role id'),
    prototype: TeamMemberRolePrototypeSchema.describe('The built-in prototype this custom role extends'),
    name: z.string().trim().min(1).describe('The manager-facing name for this custom role'),
    promptExtension: z.string().trim().min(1).nullable().optional()
        .describe('Optional append-only role prompt extension'),
    ...teamRoleSettingsSchema,
})

function hasRolePatch(body: z.infer<typeof UPDATE_ROLE_INPUT_SCHEMA>): boolean {
    return body.name !== undefined
        || body.promptExtension !== undefined
        || body.providerFlavor !== undefined
        || body.model !== undefined
        || body.reasoningEffort !== undefined
        || body.isolationMode !== undefined
}

export const UPDATE_ROLE_INPUT_SCHEMA = z.object({
    roleId: TeamRoleIdSchema.describe('The authoritative role id to patch'),
    name: z.string().trim().min(1).optional().describe('Optional new role name'),
    promptExtension: z.string().trim().min(1).nullable().optional()
        .describe('Optional new append-only role prompt extension'),
    ...teamRoleSettingsSchema,
}).refine(hasRolePatch, {
    message: 'At least one role field must be provided',
})

export const DELETE_ROLE_INPUT_SCHEMA = z.object({
    roleId: TeamRoleIdSchema.describe('The authoritative custom role id to delete'),
})

export const UPDATE_MEMBER_INPUT_SCHEMA = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('remove'),
        memberId: z.string().min(1).describe('The historical or active member id to remove from the roster')
    }),
    z.object({
        action: z.literal('replace'),
        memberId: z.string().min(1).describe('The member id to supersede with a fresh revision'),
        providerFlavor: TeamProviderFlavorSchema.nullish()
            .describe('Optional provider override for the new revision'),
        model: z.string().trim().min(1).nullable().optional()
            .describe('Optional model override for the new revision'),
        reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).nullable().optional()
            .describe('Optional reasoning effort override'),
        isolationMode: z.enum(['simple', 'worktree']).optional()
            .describe('Optional isolation override'),
        taskId: z.string().min(1).optional()
            .describe('Optional open task id to carry into the new revision'),
        instruction: z.string().trim().min(1).optional()
            .describe('Optional first instruction for the replacement member'),
        requireFreshPerspective: z.boolean().optional()
            .describe('Keep true when the old lineage should not be resumed in place'),
        taskGoal: z.string().trim().min(1).optional()
            .describe('Optional compact task goal for revision carryover'),
        artifactSummary: z.string().trim().min(1).optional()
            .describe('Optional artifact summary for revision carryover'),
        attemptSummary: z.string().trim().min(1).optional()
            .describe('Optional attempt summary for revision carryover'),
        failureSummary: z.string().trim().min(1).optional()
            .describe('Optional failure summary for revision carryover'),
        reviewSummary: z.string().trim().min(1).optional()
            .describe('Optional review or verification summary for revision carryover'),
        filePointers: z.array(z.string().trim().min(1)).optional()
            .describe('Optional important file pointers for revision carryover')
    })
])

export const CREATE_TASK_INPUT_SCHEMA = z.object({
    title: z.string().trim().min(1).describe('The new task title'),
    description: z.string().trim().min(1).nullable().optional().describe('Optional task description'),
    acceptanceCriteria: z.string().trim().min(1).nullable().optional().describe('Optional acceptance criteria'),
    parentTaskId: z.string().min(1).optional().describe('Optional parent task id'),
    status: z.enum(['todo', 'running', 'blocked', 'canceled', 'failed']).optional()
        .describe('Optional initial task status'),
    assigneeMemberId: z.string().min(1).optional().describe('Optional assignee member id'),
    reviewerMemberId: z.string().min(1).optional().describe('Optional reviewer member id'),
    verifierMemberId: z.string().min(1).optional().describe('Optional verifier member id'),
    priority: z.string().trim().min(1).nullable().optional().describe('Optional priority label'),
    dependsOn: z.array(z.string().min(1)).optional().describe('Optional dependency task ids'),
    note: z.string().trim().min(1).optional().describe('Optional first assignment note for the assignee')
})

export const UPDATE_TASK_INPUT_SCHEMA = z.object({
    taskId: z.string().min(1).describe('The team task id to update'),
    title: z.string().trim().min(1).optional().describe('Optional new title'),
    description: z.string().trim().min(1).nullable().optional().describe('Optional new description'),
    acceptanceCriteria: z.string().trim().min(1).nullable().optional().describe('Optional new acceptance criteria'),
    status: z.enum(['todo', 'running', 'blocked', 'canceled', 'failed']).optional()
        .describe('Optional new task status'),
    assigneeMemberId: z.string().min(1).nullable().optional().describe('Optional new assignee member id'),
    reviewerMemberId: z.string().min(1).nullable().optional().describe('Optional new reviewer member id'),
    verifierMemberId: z.string().min(1).nullable().optional().describe('Optional new verifier member id'),
    priority: z.string().trim().min(1).nullable().optional().describe('Optional new priority label'),
    dependsOn: z.array(z.string().min(1)).optional().describe('Optional dependency task ids'),
    note: z.string().trim().min(1).optional().describe('Optional follow-up note for the assignee')
})

export const MESSAGE_MEMBER_INPUT_SCHEMA = z.object({
    memberId: z.string().min(1).describe('The manager-controlled team member id to message'),
    text: z.string().trim().min(1).describe('The message text to append into the member transcript'),
    kind: z.enum(['task-assign', 'follow-up', 'coordination']).optional()
        .describe('Optional message kind; defaults to follow-up')
})

export const REVIEW_REQUEST_INPUT_SCHEMA = z.object({
    taskId: z.string().min(1).describe('The team task id to send for review'),
    reviewerMemberId: z.string().min(1).describe('The reviewer member id who should handle the review'),
    note: z.string().trim().min(1).optional().describe('Optional review focus or extra instructions')
})

export const REVIEW_RESULT_INPUT_SCHEMA = z.object({
    taskId: z.string().min(1).describe('The team task id being reviewed'),
    decision: z.enum(['accept', 'request_changes']).describe('Final review decision'),
    summary: z.string().trim().min(1).describe('Concise review summary covering regressions, risks, and missing tests')
})

export const VERIFICATION_REQUEST_INPUT_SCHEMA = z.object({
    taskId: z.string().min(1).describe('The team task id to verify'),
    verifierMemberId: z.string().min(1).describe('The verifier member id who should run verification'),
    note: z.string().trim().min(1).optional().describe('Optional verification focus or extra instructions')
})

export const VERIFICATION_RESULT_INPUT_SCHEMA = z.object({
    taskId: z.string().min(1).describe('The team task id being verified'),
    decision: z.enum(['pass', 'fail']).describe('Final verification decision'),
    summary: z.string().trim().min(1).describe('Concise verification summary covering tests, smoke, and criteria checks')
})

export const ACCEPT_TASK_INPUT_SCHEMA = z.object({
    taskId: z.string().min(1).describe('The team task id to accept'),
    summary: z.string().trim().min(1).optional().describe('Optional final acceptance summary'),
    skipVerificationReason: z.string().trim().min(1).optional().describe('Reason for skipping verification when explicitly required')
})

export const CLOSE_PROJECT_INPUT_SCHEMA = z.object({
    summary: z.string().trim().min(1).optional()
        .describe('Optional project delivery summary when closing the manager-teams project')
})
