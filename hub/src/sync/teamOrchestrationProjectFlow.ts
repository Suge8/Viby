import type {
    CloseTeamProjectInput,
    TeamProjectActionResult,
    UpdateTeamProjectSettingsInput
} from './teamOrchestrationContracts'
import {
    resolveActor,
    type TeamOrchestrationRuntime
} from './teamOrchestrationCommon'
import { TeamOrchestrationError } from './teamOrchestrationContracts'
import { normalizeOptionalText } from './teamOrchestrationMessages'
import { createTeamEventRecord } from './teamOrchestrationRecords'

function buildProjectUpdatedPayload(
    previousProject: Awaited<ReturnType<TeamOrchestrationRuntime['contextReader']['requireActiveProjectOwnedByManager']>>['project'],
    nextProject: typeof previousProject
): Record<string, unknown> {
    const updatedFields: string[] = []
    if (previousProject.maxActiveMembers !== nextProject.maxActiveMembers) {
        updatedFields.push('maxActiveMembers')
    }
    if (previousProject.defaultIsolationMode !== nextProject.defaultIsolationMode) {
        updatedFields.push('defaultIsolationMode')
    }

    return {
        updatedFields,
        previousMaxActiveMembers: previousProject.maxActiveMembers,
        nextMaxActiveMembers: nextProject.maxActiveMembers,
        previousDefaultIsolationMode: previousProject.defaultIsolationMode,
        nextDefaultIsolationMode: nextProject.defaultIsolationMode
    }
}

export async function updateProjectSettings(
    runtime: TeamOrchestrationRuntime,
    input: UpdateTeamProjectSettingsInput
): Promise<TeamProjectActionResult> {
    const snapshot = runtime.contextReader.requireActiveProjectOwnedByManager(
        input.projectId,
        input.managerSessionId
    )

    if (
        snapshot.project.maxActiveMembers === input.maxActiveMembers
        && snapshot.project.defaultIsolationMode === input.defaultIsolationMode
    ) {
        return {
            project: snapshot.project,
            snapshot
        }
    }

    const now = Date.now()
    const nextProject = {
        ...snapshot.project,
        maxActiveMembers: input.maxActiveMembers,
        defaultIsolationMode: input.defaultIsolationMode,
        updatedAt: now
    }
    const result = runtime.coordinator.applyCommand({
        type: 'upsert-project',
        project: nextProject,
        event: createTeamEventRecord(nextProject.id, 'project', {
            kind: 'project-updated',
            actorType: 'manager',
            actorId: input.managerSessionId,
            targetId: nextProject.id,
            payload: buildProjectUpdatedPayload(snapshot.project, nextProject),
            createdAt: now
        }),
        affectedSessionIds: [input.managerSessionId]
    })

    return {
        project: nextProject,
        snapshot: result.snapshot
    }
}

export async function closeProject(
    runtime: TeamOrchestrationRuntime,
    input: CloseTeamProjectInput
): Promise<TeamProjectActionResult> {
    const snapshot = runtime.contextReader.requireProjectClosable(input.projectId, input.managerSessionId)
    const actor = resolveActor(input.managerSessionId)

    for (const member of snapshot.members) {
        if (member.membershipState === 'active') {
            await runtime.lifecycleService.archiveSessionWithActor(member.sessionId, actor)
        }
    }

    const refreshedSnapshot = runtime.coordinator.getProjectSnapshot(input.projectId)
    if (!refreshedSnapshot) {
        throw new TeamOrchestrationError('Team project not found', 'team_project_not_found', 404)
    }
    if (refreshedSnapshot.project.status === 'delivered') {
        return {
            project: refreshedSnapshot.project,
            snapshot: refreshedSnapshot
        }
    }

    const now = Date.now()
    const nextProject = {
        ...refreshedSnapshot.project,
        status: 'delivered' as const,
        updatedAt: now,
        deliveredAt: refreshedSnapshot.project.deliveredAt ?? now
    }
    const result = runtime.coordinator.applyCommand({
        type: 'upsert-project',
        project: nextProject,
        event: createTeamEventRecord(nextProject.id, 'project', {
            kind: 'project-delivered',
            actorType: 'manager',
            actorId: input.managerSessionId,
            targetId: nextProject.id,
            payload: {
                summary: normalizeOptionalText(input.summary)
            },
            createdAt: now
        }),
        affectedSessionIds: [input.managerSessionId]
    })

    return {
        project: nextProject,
        snapshot: result.snapshot
    }
}
