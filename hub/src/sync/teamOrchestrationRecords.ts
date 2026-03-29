import { randomUUID } from 'node:crypto'
import type {
    TeamEventRecord,
    TeamTaskRecord,
} from '@viby/protocol/types'
import type { MutableTeamTaskStatus } from './teamOrchestrationContracts'

export type BuildTeamTaskRecordInput = {
    projectId: string
    title: string
    description: string | null
    acceptanceCriteria: string | null
    parentTaskId: string | null
    status: MutableTeamTaskStatus
    assigneeMemberId: string | null
    reviewerMemberId: string | null
    verifierMemberId: string | null
    priority: string | null
    dependsOn: string[]
    createdAt: number
}

export type CreateTeamEventRecordInput = Omit<TeamEventRecord, 'id' | 'projectId' | 'targetType'>

export function buildTeamTaskRecord(input: BuildTeamTaskRecordInput): TeamTaskRecord {
    return {
        id: randomUUID(),
        projectId: input.projectId,
        parentTaskId: input.parentTaskId,
        title: input.title,
        description: input.description,
        acceptanceCriteria: input.acceptanceCriteria,
        status: input.status,
        assigneeMemberId: input.assigneeMemberId,
        reviewerMemberId: input.reviewerMemberId,
        verifierMemberId: input.verifierMemberId,
        priority: input.priority,
        dependsOn: input.dependsOn,
        retryCount: 0,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        completedAt: null,
    }
}

export function createTeamEventRecord(
    projectId: string,
    targetType: TeamEventRecord['targetType'],
    input: CreateTeamEventRecordInput,
): TeamEventRecord {
    return {
        id: randomUUID(),
        projectId,
        targetType,
        ...input,
    }
}
