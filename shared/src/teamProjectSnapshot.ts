import { z } from 'zod'
import {
    TeamEventKindSchema,
    TeamEventRecordSchema,
    TeamMemberRecordSchema,
    TeamProjectAcceptanceReadModelSchema,
    TeamProjectIsolationModeSchema,
    TeamProjectSchema,
    TeamProjectStatusSchema,
    TeamRoleIdSchema,
    TeamRoleDefinitionSchema,
    TeamTaskAcceptanceStateSchema,
    TeamTaskRecordSchema,
} from './teamSchemas'

export const TEAM_PROJECT_COMPACT_MEMBER_LIMIT = 6
export const TEAM_PROJECT_COMPACT_INACTIVE_MEMBER_LIMIT = 4
export const TEAM_PROJECT_COMPACT_TASK_LIMIT = 8
export const TEAM_PROJECT_COMPACT_EVENT_LIMIT = 8
export const TEAM_PROJECT_COMPACT_ACCEPTANCE_LIMIT = 5

export const TEAM_PROJECT_WAKE_PRIORITIES = ['high', 'medium'] as const
export const TEAM_PROJECT_WAKE_REASON_KINDS = [
    'blocked-task',
    'review-failed',
    'verification-failed',
    'user-interjected',
    'user-takeover-started',
    'user-takeover-ended',
    'member-session-drift',
    'ready-to-deliver',
] as const
export const TEAM_PROJECT_NEXT_ACTION_KINDS = [
    'replan-blocked-task',
    'revise-failed-task',
    'inspect-user-change',
    'inspect-member-session',
    'resolve-staffing',
    'perform-manager-acceptance',
    'deliver-project',
] as const
export const TEAM_PROJECT_SEAT_PRESSURES = [
    'available',
    'limited',
    'at_capacity',
] as const
export const TEAM_PROJECT_STAFFING_HINT_KINDS = [
    'reuse-existing-lineage',
    'replace-current-member',
    'spawn-new-member',
    'free-capacity',
] as const
export const TEAM_PROJECT_MEMBER_LAUNCH_STRATEGIES = [
    'spawn',
    'resume',
    'revision',
] as const

export const TeamProjectWakePrioritySchema = z.enum(TEAM_PROJECT_WAKE_PRIORITIES)
export const TeamProjectWakeReasonKindSchema = z.enum(TEAM_PROJECT_WAKE_REASON_KINDS)
export const TeamProjectNextActionKindSchema = z.enum(TEAM_PROJECT_NEXT_ACTION_KINDS)
export const TeamProjectSeatPressureSchema = z.enum(TEAM_PROJECT_SEAT_PRESSURES)
export const TeamProjectStaffingHintKindSchema = z.enum(TEAM_PROJECT_STAFFING_HINT_KINDS)
export const TeamProjectMemberLaunchStrategySchema = z.enum(TEAM_PROJECT_MEMBER_LAUNCH_STRATEGIES)

export type TeamProjectWakePriority = z.infer<typeof TeamProjectWakePrioritySchema>
export type TeamProjectWakeReasonKind = z.infer<typeof TeamProjectWakeReasonKindSchema>
export type TeamProjectNextActionKind = z.infer<typeof TeamProjectNextActionKindSchema>
export type TeamProjectSeatPressure = z.infer<typeof TeamProjectSeatPressureSchema>
export type TeamProjectStaffingHintKind = z.infer<typeof TeamProjectStaffingHintKindSchema>
export type TeamProjectMemberLaunchStrategy = z.infer<typeof TeamProjectMemberLaunchStrategySchema>

export const TeamProjectCompactProjectSchema = z.object({
    id: TeamProjectSchema.shape.id,
    title: TeamProjectSchema.shape.title,
    goal: TeamProjectSchema.shape.goal,
    status: TeamProjectStatusSchema,
    maxActiveMembers: TeamProjectSchema.shape.maxActiveMembers,
    defaultIsolationMode: TeamProjectIsolationModeSchema,
    updatedAt: TeamProjectSchema.shape.updatedAt,
    deliveredAt: TeamProjectSchema.shape.deliveredAt,
})

export type TeamProjectCompactProject = z.infer<typeof TeamProjectCompactProjectSchema>

export const TeamProjectCompactMemberSchema = z.object({
    id: TeamMemberRecordSchema.shape.id,
    sessionId: TeamMemberRecordSchema.shape.sessionId,
    role: TeamMemberRecordSchema.shape.role,
    roleId: TeamMemberRecordSchema.shape.roleId,
    roleName: z.string().trim().min(1).nullable(),
    membershipState: TeamMemberRecordSchema.shape.membershipState,
    controlOwner: TeamMemberRecordSchema.shape.controlOwner,
    revision: TeamMemberRecordSchema.shape.revision,
    spawnedForTaskId: TeamMemberRecordSchema.shape.spawnedForTaskId,
    updatedAt: TeamMemberRecordSchema.shape.updatedAt,
})

export type TeamProjectCompactMember = z.infer<typeof TeamProjectCompactMemberSchema>

export const TeamProjectCompactTaskSchema = z.object({
    id: TeamTaskRecordSchema.shape.id,
    title: TeamTaskRecordSchema.shape.title,
    status: TeamTaskRecordSchema.shape.status,
    priority: TeamTaskRecordSchema.shape.priority,
    assigneeMemberId: TeamTaskRecordSchema.shape.assigneeMemberId,
    reviewerMemberId: TeamTaskRecordSchema.shape.reviewerMemberId,
    verifierMemberId: TeamTaskRecordSchema.shape.verifierMemberId,
    retryCount: TeamTaskRecordSchema.shape.retryCount,
    updatedAt: TeamTaskRecordSchema.shape.updatedAt,
    acceptance: TeamTaskAcceptanceStateSchema,
})

export type TeamProjectCompactTask = z.infer<typeof TeamProjectCompactTaskSchema>

export const TeamProjectCompactEventSchema = z.object({
    id: TeamEventRecordSchema.shape.id,
    kind: TeamEventKindSchema,
    targetId: TeamEventRecordSchema.shape.targetId,
    createdAt: TeamEventRecordSchema.shape.createdAt,
    summary: z.string().trim().min(1),
})

export type TeamProjectCompactEvent = z.infer<typeof TeamProjectCompactEventSchema>

export const TeamProjectWakeReasonSchema = z.object({
    kind: TeamProjectWakeReasonKindSchema,
    priority: TeamProjectWakePrioritySchema,
    summary: z.string().trim().min(1),
    taskId: z.string().nullable(),
    memberId: z.string().nullable(),
    eventId: z.string().nullable(),
    eventKind: TeamEventKindSchema.nullable(),
})

export type TeamProjectWakeReason = z.infer<typeof TeamProjectWakeReasonSchema>

export const TeamProjectNextActionHintSchema = z.object({
    kind: TeamProjectNextActionKindSchema,
    summary: z.string().trim().min(1),
    taskId: z.string().nullable(),
    memberId: z.string().nullable(),
    wakeReasonKind: TeamProjectWakeReasonKindSchema.nullable(),
})

export type TeamProjectNextActionHint = z.infer<typeof TeamProjectNextActionHintSchema>

export const TeamProjectCompactCountsSchema = z.object({
    activeMemberCount: z.number().int().nonnegative(),
    inactiveMemberCount: z.number().int().nonnegative(),
    openTaskCount: z.number().int().nonnegative(),
    blockedTaskCount: z.number().int().nonnegative(),
    reviewFailedTaskCount: z.number().int().nonnegative(),
    verificationFailedTaskCount: z.number().int().nonnegative(),
    readyForManagerAcceptanceCount: z.number().int().nonnegative(),
    deliveryReady: z.boolean(),
})

export type TeamProjectCompactCounts = z.infer<typeof TeamProjectCompactCountsSchema>

export const TeamProjectStaffingHintSchema = z.object({
    kind: TeamProjectStaffingHintKindSchema,
    priority: TeamProjectWakePrioritySchema,
    summary: z.string().trim().min(1),
    taskId: z.string().nullable(),
    roleId: TeamRoleIdSchema.nullable(),
    memberId: z.string().nullable(),
    candidateMemberId: z.string().nullable(),
    launchStrategy: TeamProjectMemberLaunchStrategySchema.nullable(),
})

export type TeamProjectStaffingHint = z.infer<typeof TeamProjectStaffingHintSchema>

export const TeamProjectCompactStaffingSchema = z.object({
    seatPressure: TeamProjectSeatPressureSchema,
    remainingMemberSlots: z.number().int().nonnegative(),
    hints: z.array(TeamProjectStaffingHintSchema),
})

export type TeamProjectCompactStaffing = z.infer<typeof TeamProjectCompactStaffingSchema>

export const TeamProjectCompactBriefSchema = z.object({
    project: TeamProjectCompactProjectSchema,
    summary: z.string().trim().min(1),
    counts: TeamProjectCompactCountsSchema,
    staffing: TeamProjectCompactStaffingSchema,
    activeMembers: z.array(TeamProjectCompactMemberSchema),
    inactiveMembers: z.array(TeamProjectCompactMemberSchema),
    openTasks: z.array(TeamProjectCompactTaskSchema),
    recentEvents: z.array(TeamProjectCompactEventSchema),
    recentAcceptanceResults: z.array(TeamProjectCompactEventSchema),
    wakeReasons: z.array(TeamProjectWakeReasonSchema),
    nextActions: z.array(TeamProjectNextActionHintSchema),
})

export type TeamProjectCompactBrief = z.infer<typeof TeamProjectCompactBriefSchema>

export const TeamProjectSnapshotSchema = z.object({
    project: TeamProjectSchema,
    roles: z.array(TeamRoleDefinitionSchema),
    members: z.array(TeamMemberRecordSchema),
    tasks: z.array(TeamTaskRecordSchema),
    events: z.array(TeamEventRecordSchema),
    acceptance: TeamProjectAcceptanceReadModelSchema,
    compactBrief: TeamProjectCompactBriefSchema,
})

export type TeamProjectSnapshot = z.infer<typeof TeamProjectSnapshotSchema>

export const TeamProjectHistoryResponseSchema = z.object({
    projectId: z.string(),
    events: z.array(TeamEventRecordSchema),
})

export type TeamProjectHistoryResponse = z.infer<typeof TeamProjectHistoryResponseSchema>
