import { z } from 'zod'
import { AGENT_FLAVORS, MODEL_REASONING_EFFORTS } from './modes'

export const TEAM_SESSION_SPAWN_ROLES = ['normal', 'manager'] as const
export const TEAM_SESSION_ROLES = ['manager', 'member'] as const
export const TEAM_ROLE_PROTOTYPES = [
    'manager',
    'planner',
    'architect',
    'implementer',
    'debugger',
    'reviewer',
    'verifier',
    'designer'
] as const
export const TEAM_PROJECT_STATUSES = ['active', 'delivered', 'archived'] as const
export const TEAM_PROJECT_ISOLATION_MODES = ['hybrid', 'all_simple'] as const
export const TEAM_MEMBER_ISOLATION_MODES = ['simple', 'worktree'] as const
export const TEAM_CONTROL_OWNERS = ['manager', 'user'] as const
export const TEAM_MEMBERSHIP_STATES = ['active', 'archived', 'removed', 'superseded'] as const
export const TEAM_TASK_STATUSES = [
    'todo',
    'running',
    'blocked',
    'in_review',
    'in_verification',
    'done',
    'canceled',
    'failed'
] as const
export const TEAM_EVENT_KINDS = [
    'project-created',
    'project-updated',
    'project-delivered',
    'project-archived',
    'member-spawned',
    'member-control-changed',
    'member-archived',
    'member-removed',
    'member-replaced',
    'task-created',
    'task-assigned',
    'task-status-changed',
    'task-commented',
    'broadcast-sent',
    'direct-message-sent',
    'user-interjected',
    'user-takeover-started',
    'user-takeover-ended',
    'review-requested',
    'review-passed',
    'review-failed',
    'verification-requested',
    'verification-passed',
    'verification-failed',
    'manager-accepted'
] as const
export const TEAM_EVENT_ACTOR_TYPES = ['manager', 'member', 'user', 'system'] as const
export const TEAM_EVENT_TARGET_TYPES = ['project', 'member', 'task', 'session'] as const

export const TeamSessionSpawnRoleSchema = z.enum(TEAM_SESSION_SPAWN_ROLES)
export const TeamSessionRoleSchema = z.enum(TEAM_SESSION_ROLES)
export const TeamRolePrototypeSchema = z.enum(TEAM_ROLE_PROTOTYPES)
export const TeamProjectStatusSchema = z.enum(TEAM_PROJECT_STATUSES)
export const TeamProjectIsolationModeSchema = z.enum(TEAM_PROJECT_ISOLATION_MODES)
export const TeamMemberIsolationModeSchema = z.enum(TEAM_MEMBER_ISOLATION_MODES)
export const TeamControlOwnerSchema = z.enum(TEAM_CONTROL_OWNERS)
export const TeamMembershipStateSchema = z.enum(TEAM_MEMBERSHIP_STATES)
export const TeamTaskStatusSchema = z.enum(TEAM_TASK_STATUSES)
export const TeamEventKindSchema = z.enum(TEAM_EVENT_KINDS)
export const TeamEventActorTypeSchema = z.enum(TEAM_EVENT_ACTOR_TYPES)
export const TeamEventTargetTypeSchema = z.enum(TEAM_EVENT_TARGET_TYPES)
export const TeamProviderFlavorSchema = z.enum(AGENT_FLAVORS)
export const TeamReasoningEffortSchema = z.enum(MODEL_REASONING_EFFORTS)

export type TeamSessionSpawnRole = z.infer<typeof TeamSessionSpawnRoleSchema>
export type TeamSessionRole = z.infer<typeof TeamSessionRoleSchema>
export type TeamRolePrototype = z.infer<typeof TeamRolePrototypeSchema>
export type TeamProjectStatus = z.infer<typeof TeamProjectStatusSchema>
export type TeamProjectIsolationMode = z.infer<typeof TeamProjectIsolationModeSchema>
export type TeamMemberIsolationMode = z.infer<typeof TeamMemberIsolationModeSchema>
export type TeamControlOwner = z.infer<typeof TeamControlOwnerSchema>
export type TeamMembershipState = z.infer<typeof TeamMembershipStateSchema>
export type TeamTaskStatus = z.infer<typeof TeamTaskStatusSchema>
export type TeamEventKind = z.infer<typeof TeamEventKindSchema>
export type TeamEventActorType = z.infer<typeof TeamEventActorTypeSchema>
export type TeamEventTargetType = z.infer<typeof TeamEventTargetTypeSchema>
export type TeamProviderFlavor = z.infer<typeof TeamProviderFlavorSchema>
export type TeamReasoningEffort = z.infer<typeof TeamReasoningEffortSchema>

export const TeamProjectSchema = z.object({
    id: z.string(),
    managerSessionId: z.string(),
    machineId: z.string().nullable(),
    rootDirectory: z.string().nullable(),
    title: z.string(),
    goal: z.string().nullable(),
    status: TeamProjectStatusSchema,
    maxActiveMembers: z.number().int().positive(),
    defaultIsolationMode: TeamProjectIsolationModeSchema,
    createdAt: z.number(),
    updatedAt: z.number(),
    deliveredAt: z.number().nullable(),
    archivedAt: z.number().nullable()
})

export type TeamProject = z.infer<typeof TeamProjectSchema>

export const TeamMemberRecordSchema = z.object({
    id: z.string(),
    projectId: z.string(),
    sessionId: z.string(),
    managerSessionId: z.string(),
    role: TeamRolePrototypeSchema,
    providerFlavor: TeamProviderFlavorSchema.nullable(),
    model: z.string().nullable(),
    reasoningEffort: TeamReasoningEffortSchema.nullable(),
    isolationMode: TeamMemberIsolationModeSchema,
    workspaceRoot: z.string().nullable(),
    controlOwner: TeamControlOwnerSchema,
    membershipState: TeamMembershipStateSchema,
    revision: z.number().int().positive(),
    supersedesMemberId: z.string().nullable(),
    supersededByMemberId: z.string().nullable(),
    spawnedForTaskId: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number(),
    archivedAt: z.number().nullable(),
    removedAt: z.number().nullable()
})

export type TeamMemberRecord = z.infer<typeof TeamMemberRecordSchema>

export const TeamTaskRecordSchema = z.object({
    id: z.string(),
    projectId: z.string(),
    parentTaskId: z.string().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    acceptanceCriteria: z.string().nullable(),
    status: TeamTaskStatusSchema,
    assigneeMemberId: z.string().nullable(),
    reviewerMemberId: z.string().nullable(),
    verifierMemberId: z.string().nullable(),
    priority: z.string().nullable(),
    dependsOn: z.array(z.string()),
    retryCount: z.number().int().nonnegative(),
    createdAt: z.number(),
    updatedAt: z.number(),
    completedAt: z.number().nullable()
})

export type TeamTaskRecord = z.infer<typeof TeamTaskRecordSchema>

export const TeamEventRecordSchema = z.object({
    id: z.string(),
    projectId: z.string(),
    kind: TeamEventKindSchema,
    actorType: TeamEventActorTypeSchema,
    actorId: z.string().nullable(),
    targetType: TeamEventTargetTypeSchema,
    targetId: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.number()
})

export type TeamEventRecord = z.infer<typeof TeamEventRecordSchema>

export const SessionTeamContextSchema = z.object({
    projectId: z.string(),
    sessionRole: TeamSessionRoleSchema,
    managerSessionId: z.string(),
    managerTitle: z.string().optional(),
    memberId: z.string().optional(),
    memberRole: TeamRolePrototypeSchema.optional(),
    memberRevision: z.number().int().positive().optional(),
    controlOwner: TeamControlOwnerSchema.optional(),
    membershipState: TeamMembershipStateSchema.optional(),
    projectStatus: TeamProjectStatusSchema,
    activeMemberCount: z.number().int().nonnegative().optional(),
    archivedMemberCount: z.number().int().nonnegative().optional(),
    runningMemberCount: z.number().int().nonnegative().optional(),
    blockedTaskCount: z.number().int().nonnegative().optional()
})

export type SessionTeamContext = z.infer<typeof SessionTeamContextSchema>

export const SessionSummaryTeamSchema = z.object({
    projectId: z.string(),
    sessionRole: TeamSessionRoleSchema,
    managerSessionId: z.string(),
    managerTitle: z.string().optional(),
    memberRole: TeamRolePrototypeSchema.optional(),
    memberRevision: z.number().int().positive().optional(),
    membershipState: TeamMembershipStateSchema.optional(),
    controlOwner: TeamControlOwnerSchema.optional(),
    projectStatus: TeamProjectStatusSchema,
    activeMemberCount: z.number().int().nonnegative(),
    archivedMemberCount: z.number().int().nonnegative(),
    runningMemberCount: z.number().int().nonnegative(),
    blockedTaskCount: z.number().int().nonnegative()
})

export type SessionSummaryTeam = z.infer<typeof SessionSummaryTeamSchema>
