import { z } from 'zod'
import { TeamControlOwnerSchema, TeamSessionRoleSchema } from './teamSchemas'

export const MESSAGE_SENT_FROM = ['cli', 'webapp', 'manager', 'user', 'team-system'] as const
export const TEAM_MESSAGE_KINDS = [
    'task-assign',
    'follow-up',
    'review-request',
    'verify-request',
    'coordination',
    'system-event'
] as const

export const MessageSentFromSchema = z.enum(MESSAGE_SENT_FROM)
export const TeamMessageKindSchema = z.enum(TEAM_MESSAGE_KINDS)

export type MessageSentFrom = z.infer<typeof MessageSentFromSchema>
export type TeamMessageKind = z.infer<typeof TeamMessageKindSchema>

const TEAM_META_REQUIRED_FIELDS = [
    'teamProjectId',
    'managerSessionId',
    'sessionRole',
    'teamMessageKind'
] as const

export const MessageMetaSchema = z.object({
    sentFrom: MessageSentFromSchema.optional(),
    fallbackModel: z.string().nullable().optional(),
    customSystemPrompt: z.string().nullable().optional(),
    appendSystemPrompt: z.string().nullable().optional(),
    allowedTools: z.array(z.string()).nullable().optional(),
    disallowedTools: z.array(z.string()).nullable().optional(),
    teamProjectId: z.string().optional(),
    managerSessionId: z.string().optional(),
    memberId: z.string().optional(),
    sessionRole: TeamSessionRoleSchema.optional(),
    teamMessageKind: TeamMessageKindSchema.optional(),
    controlOwner: TeamControlOwnerSchema.optional()
}).superRefine((value, ctx) => {
    const hasTeamMetadata = value.teamProjectId !== undefined
        || value.managerSessionId !== undefined
        || value.memberId !== undefined
        || value.sessionRole !== undefined
        || value.teamMessageKind !== undefined
        || value.controlOwner !== undefined

    if (!hasTeamMetadata) {
        return
    }

    for (const field of TEAM_META_REQUIRED_FIELDS) {
        if (value[field] === undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [field],
                message: `${field} is required when team metadata is present`
            })
        }
    }
})

export type MessageMeta = z.infer<typeof MessageMetaSchema>
