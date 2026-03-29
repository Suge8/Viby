import type {
    MessageMeta,
    TeamEventRecord,
    TeamMemberRecord,
    TeamProject,
    TeamProjectSnapshot,
    TeamTaskRecord
} from '@viby/protocol/types'

export type TeamAcceptanceErrorCode =
    | 'team_task_not_found'
    | 'team_project_not_found'
    | 'team_manager_session_not_found'
    | 'team_manager_mismatch'
    | 'team_task_closed'
    | 'team_member_not_found'
    | 'team_member_project_mismatch'
    | 'team_member_inactive'
    | 'team_member_control_conflict'
    | 'team_member_role_mismatch'
    | 'team_member_session_not_found'
    | 'team_review_not_requested'
    | 'team_review_not_passed'
    | 'team_verification_not_requested'
    | 'team_verification_required'
    | 'team_reviewer_mismatch'
    | 'team_verifier_mismatch'

export class TeamAcceptanceError extends Error {
    readonly code: TeamAcceptanceErrorCode
    readonly status: 404 | 409

    constructor(message: string, code: TeamAcceptanceErrorCode, status: 404 | 409) {
        super(message)
        this.name = 'TeamAcceptanceError'
        this.code = code
        this.status = status
    }
}

export type AppendMessagePayload = {
    text: string
    meta: MessageMeta
}

export type AppendMessage = (sessionId: string, payload: AppendMessagePayload) => Promise<unknown>
export type EnsureMessageTarget = (sessionId: string) => Promise<void>

export type TeamAcceptanceRuntime = {
    appendInternalUserMessage: AppendMessage
    appendPassiveInternalUserMessage: AppendMessage
    ensurePassiveInternalUserMessageTarget: EnsureMessageTarget
}

export type TeamTaskContext = {
    task: TeamTaskRecord
    project: TeamProject
    taskEvents: TeamEventRecord[]
    assignee: TeamMemberRecord | null
}

export type TeamTaskActionResult = {
    task: TeamTaskRecord
    snapshot: TeamProjectSnapshot
}

export type RequestTaskReviewInput = {
    managerSessionId: string
    taskId: string
    reviewerMemberId: string
    note?: string | null
}

export type SubmitTaskReviewResultInput = {
    memberId: string
    taskId: string
    decision: 'accept' | 'request_changes'
    summary: string
}

export type RequestTaskVerificationInput = {
    managerSessionId: string
    taskId: string
    verifierMemberId: string
    note?: string | null
}

export type SubmitTaskVerificationResultInput = {
    memberId: string
    taskId: string
    decision: 'pass' | 'fail'
    summary: string
}

export type AcceptTeamTaskInput = {
    managerSessionId: string
    taskId: string
    summary?: string | null
    skipVerificationReason?: string | null
}
