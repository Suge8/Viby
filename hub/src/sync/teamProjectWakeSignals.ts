import { isTerminalTeamTaskStatus, TEAM_PROJECT_COMPACT_EVENT_LIMIT } from '@viby/protocol'
import type {
    TeamProjectCompactStaffing,
    TeamProjectNextActionHint,
    TeamProjectWakeReason,
    TeamTaskRecord,
} from '@viby/protocol/types'
import {
    buildMemberLabel,
    buildMemberMap,
    buildTaskMap,
    formatLaunchReason,
    getTaskAcceptance,
    isProjectReadyToDeliver,
    isTaskReadyForManagerAcceptance,
    summarizeEvent,
    takeMostRecentCreated,
    type TeamProjectCompactBriefSource,
} from './teamProjectCompactBriefSupport'

const USER_CONTROL_EVENT_KIND_SET = new Set<TeamProjectWakeReason['kind']>([
    'user-interjected',
    'user-takeover-started',
    'user-takeover-ended'
])
const MEMBER_REVISION_EVENT_KIND_SET = new Set([
    'member-spawned',
    'member-replaced'
])
const NON_WAKE_LAUNCH_REASONS = new Set(['no_prior_member', 'resume_supported'])

function pushWakeReason(target: TeamProjectWakeReason[], reason: TeamProjectWakeReason): void {
    const duplicate = target.some((candidate) => candidate.kind === reason.kind
        && candidate.taskId === reason.taskId
        && candidate.memberId === reason.memberId
        && candidate.eventId === reason.eventId)
    if (!duplicate) {
        target.push(reason)
    }
}

export function buildWakeReasons(
    source: TeamProjectCompactBriefSource,
    roleNames: Map<string, string>
): TeamProjectWakeReason[] {
    const reasons: TeamProjectWakeReason[] = []
    const tasksById = buildTaskMap(source.tasks)
    const membersById = buildMemberMap(source.members)

    for (const task of source.tasks.filter((candidate) => candidate.status === 'blocked')) {
        pushWakeReason(reasons, {
            kind: 'blocked-task',
            priority: 'high',
            summary: `Task "${task.title}" is blocked and needs replan or unblock work.`,
            taskId: task.id,
            memberId: task.assigneeMemberId,
            eventId: null,
            eventKind: null
        })
    }

    for (const task of source.tasks.filter((candidate) => !isTerminalTeamTaskStatus(candidate.status))) {
        const record = getTaskAcceptance(source.acceptance, task.id)
        if (record.reviewStatus === 'failed') {
            pushWakeReason(reasons, {
                kind: 'review-failed',
                priority: 'high',
                summary: `Task "${task.title}" failed review and needs revision or reassignment.`,
                taskId: task.id,
                memberId: task.assigneeMemberId,
                eventId: record.latestAcceptanceEvent?.id ?? null,
                eventKind: record.latestAcceptanceEvent?.kind ?? null
            })
        }
        if (record.verificationStatus === 'failed') {
            pushWakeReason(reasons, {
                kind: 'verification-failed',
                priority: 'high',
                summary: `Task "${task.title}" failed verification and needs another implementation pass.`,
                taskId: task.id,
                memberId: task.assigneeMemberId,
                eventId: record.latestAcceptanceEvent?.id ?? null,
                eventKind: record.latestAcceptanceEvent?.kind ?? null
            })
        }
    }

    for (const event of takeMostRecentCreated(
        source.events.filter((candidate) => USER_CONTROL_EVENT_KIND_SET.has(candidate.kind as TeamProjectWakeReason['kind'])),
        3
    )) {
        const memberId = event.targetType === 'member' ? event.targetId : null
        pushWakeReason(reasons, {
            kind: event.kind as Extract<TeamProjectWakeReason['kind'], 'user-interjected' | 'user-takeover-started' | 'user-takeover-ended'>,
            priority: 'medium',
            summary: summarizeEvent(event, tasksById, membersById, roleNames),
            taskId: null,
            memberId,
            eventId: event.id,
            eventKind: event.kind
        })
    }

    for (const event of takeMostRecentCreated(
        source.events.filter((candidate) => MEMBER_REVISION_EVENT_KIND_SET.has(candidate.kind)),
        3
    )) {
        const launchReason = typeof event.payload?.reason === 'string' ? event.payload.reason : null
        if (!launchReason || NON_WAKE_LAUNCH_REASONS.has(launchReason)) {
            continue
        }
        const memberId = event.targetType === 'member' ? event.targetId : null
        const member = memberId ? membersById.get(memberId) : null
        pushWakeReason(reasons, {
            kind: 'member-session-drift',
            priority: 'medium',
            summary: `${buildMemberLabel(member, roleNames)} required a new session path because ${formatLaunchReason(launchReason)}.`,
            taskId: null,
            memberId,
            eventId: event.id,
            eventKind: event.kind
        })
    }

    if (isProjectReadyToDeliver(source)) {
        pushWakeReason(reasons, {
            kind: 'ready-to-deliver',
            priority: 'medium',
            summary: 'All tracked tasks are manager-accepted and the project is ready to deliver.',
            taskId: null,
            memberId: null,
            eventId: null,
            eventKind: null
        })
    }

    return reasons.slice(0, TEAM_PROJECT_COMPACT_EVENT_LIMIT)
}

function pushNextAction(target: TeamProjectNextActionHint[], action: TeamProjectNextActionHint): void {
    const duplicate = target.some((candidate) => candidate.kind === action.kind
        && candidate.taskId === action.taskId
        && candidate.memberId === action.memberId)
    if (!duplicate) {
        target.push(action)
    }
}

export function buildNextActions(input: {
    tasks: readonly TeamTaskRecord[]
    acceptance: TeamProjectCompactBriefSource['acceptance']
    staffing: TeamProjectCompactStaffing
    wakeReasons: readonly TeamProjectWakeReason[]
}): TeamProjectNextActionHint[] {
    const actions: TeamProjectNextActionHint[] = []
    const tasksById = buildTaskMap(input.tasks)

    for (const reason of input.wakeReasons) {
        const task = reason.taskId ? tasksById.get(reason.taskId) : undefined
        switch (reason.kind) {
            case 'blocked-task':
                pushNextAction(actions, {
                    kind: 'replan-blocked-task',
                    summary: `Replan or unblock task "${task?.title ?? reason.taskId ?? 'unknown'}".`,
                    taskId: reason.taskId,
                    memberId: reason.memberId,
                    wakeReasonKind: reason.kind
                })
                break
            case 'review-failed':
            case 'verification-failed':
                pushNextAction(actions, {
                    kind: 'revise-failed-task',
                    summary: `Revise, reassign, or rerun task "${task?.title ?? reason.taskId ?? 'unknown'}".`,
                    taskId: reason.taskId,
                    memberId: reason.memberId,
                    wakeReasonKind: reason.kind
                })
                break
            case 'user-interjected':
            case 'user-takeover-started':
            case 'user-takeover-ended':
                pushNextAction(actions, {
                    kind: 'inspect-user-change',
                    summary: 'Inspect the latest human control change before continuing orchestration.',
                    taskId: null,
                    memberId: reason.memberId,
                    wakeReasonKind: reason.kind
                })
                break
            case 'member-session-drift':
                pushNextAction(actions, {
                    kind: 'inspect-member-session',
                    summary: 'Inspect the latest member session change before scheduling follow-up work.',
                    taskId: null,
                    memberId: reason.memberId,
                    wakeReasonKind: reason.kind
                })
                break
            case 'ready-to-deliver':
                pushNextAction(actions, {
                    kind: 'deliver-project',
                    summary: 'Deliver the project when the final human-facing output is confirmed.',
                    taskId: null,
                    memberId: null,
                    wakeReasonKind: reason.kind
                })
                break
        }
    }

    for (const task of input.tasks.filter((candidate) => !isTerminalTeamTaskStatus(candidate.status))) {
        const record = getTaskAcceptance(input.acceptance, task.id)
        if (!isTaskReadyForManagerAcceptance(record)) {
            continue
        }
        pushNextAction(actions, {
            kind: 'perform-manager-acceptance',
            summary: `Perform manager acceptance for task "${task.title}".`,
            taskId: task.id,
            memberId: task.assigneeMemberId,
            wakeReasonKind: null
        })
    }

    for (const hint of input.staffing.hints) {
        pushNextAction(actions, {
            kind: 'resolve-staffing',
            summary: hint.summary,
            taskId: hint.taskId,
            memberId: hint.memberId,
            wakeReasonKind: null
        })
    }

    return actions.slice(0, TEAM_PROJECT_COMPACT_EVENT_LIMIT)
}
