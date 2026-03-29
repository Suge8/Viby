import type {
    Session,
    TeamMemberRecord,
    TeamTaskRecord
} from '@viby/protocol/types'
import { TeamOrchestrationError } from './teamOrchestrationContracts'
import type { TeamOrchestrationRuntime } from './teamOrchestrationCommon'
import {
    buildMemberMeta,
    buildTaskAssignmentText,
    normalizeOptionalText
} from './teamOrchestrationMessages'
import { createTeamEventRecord } from './teamOrchestrationRecords'

export function cleanupFailedSpawn(
    runtime: TeamOrchestrationRuntime,
    member: TeamMemberRecord,
    managerSessionId: string,
    errorMessage: string
): void {
    const now = Date.now()
    runtime.coordinator.applyCommand({
        type: 'upsert-member',
        member: {
            ...member,
            membershipState: 'removed',
            removedAt: now,
            updatedAt: now
        },
        event: createTeamEventRecord(member.projectId, 'member', {
            kind: 'member-removed',
            actorType: 'system',
            actorId: null,
            targetId: member.id,
            payload: {
                reason: 'spawn_failed',
                errorMessage
            },
            createdAt: now
        }),
        affectedSessionIds: [managerSessionId]
    })
}

export async function appendLaunchMessages(
    runtime: TeamOrchestrationRuntime,
    member: TeamMemberRecord,
    options: {
        task: TeamTaskRecord | null
        instruction?: string | null
    }
): Promise<Session> {
    if (options.task) {
        return await runtime.appendInternalUserMessage(member.sessionId, {
            text: buildTaskAssignmentText(options.task, options.instruction),
            meta: buildMemberMeta(member, 'task-assign')
        })
    }

    const instruction = normalizeOptionalText(options.instruction)
    if (!instruction) {
        const session = runtime.getSession(member.sessionId)
        if (!session) {
            throw new TeamOrchestrationError('Session not found', 'team_member_session_not_found', 404)
        }
        return session
    }

    return await runtime.appendInternalUserMessage(member.sessionId, {
        text: instruction,
        meta: buildMemberMeta(member, 'coordination')
    })
}
