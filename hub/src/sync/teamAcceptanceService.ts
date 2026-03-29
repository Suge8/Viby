import { getTaskAcceptanceState } from '@viby/protocol'
import type { Store } from '../store'
import type { TeamCoordinatorService } from './teamCoordinatorService'
import { TeamAcceptanceContextReader } from './teamAcceptanceContext'
import type {
    AcceptTeamTaskInput,
    RequestTaskReviewInput,
    RequestTaskVerificationInput,
    SubmitTaskReviewResultInput,
    SubmitTaskVerificationResultInput,
    TeamAcceptanceRuntime,
    TeamTaskActionResult
} from './teamAcceptanceContracts'
import {
    TeamAcceptanceError
} from './teamAcceptanceContracts'
import {
    buildManagerMeta,
    buildManagerReviewNotice,
    buildManagerVerificationNotice,
    buildMemberMeta,
    buildReviewRequestText,
    buildVerificationRequestText,
    normalizeOptionalText
} from './teamAcceptanceMessages'
import {
    compactSessionIds,
    createAcceptedTask,
    createReviewRequestedTask,
    createReviewResultTask,
    createVerificationRequestedTask,
    createVerificationResultTask
} from './teamAcceptanceTransitions'

export {
    TeamAcceptanceError,
    type AcceptTeamTaskInput,
    type RequestTaskReviewInput,
    type RequestTaskVerificationInput,
    type SubmitTaskReviewResultInput,
    type SubmitTaskVerificationResultInput
} from './teamAcceptanceContracts'

export class TeamAcceptanceService {
    private readonly contextReader: TeamAcceptanceContextReader

    constructor(
        private readonly store: Store,
        private readonly coordinator: TeamCoordinatorService,
        private readonly runtime: TeamAcceptanceRuntime
    ) {
        this.contextReader = new TeamAcceptanceContextReader(store)
    }

    private buildTaskActionResult(
        taskId: string,
        snapshot: TeamTaskActionResult['snapshot']
    ): TeamTaskActionResult {
        return {
            task: this.contextReader.requireSnapshotTask(snapshot, taskId),
            snapshot
        }
    }

    async requestReview(input: RequestTaskReviewInput): Promise<TeamTaskActionResult> {
        const context = this.contextReader.requireTaskContext(input.taskId, input.managerSessionId)
        const reviewer = this.contextReader.requireMemberForTask(context.project.id, input.reviewerMemberId, 'reviewer')
        const now = Date.now()
        const nextTask = createReviewRequestedTask(context.task, reviewer.id, now)

        const result = this.coordinator.applyCommand({
            type: 'upsert-task',
            task: nextTask,
            event: this.contextReader.createTaskEvent(nextTask.projectId, {
                kind: 'review-requested',
                actorType: 'manager',
                actorId: input.managerSessionId,
                targetId: nextTask.id,
                payload: {
                    reviewerMemberId: reviewer.id,
                    note: normalizeOptionalText(input.note)
                },
                createdAt: now
            }),
            affectedSessionIds: compactSessionIds([
                input.managerSessionId,
                reviewer.sessionId,
                context.assignee?.sessionId
            ])
        })

        await this.runtime.appendInternalUserMessage(reviewer.sessionId, {
            text: buildReviewRequestText(nextTask, input.note),
            meta: buildMemberMeta(reviewer, 'review-request')
        })

        return this.buildTaskActionResult(nextTask.id, result.snapshot)
    }

    async submitReviewResult(input: SubmitTaskReviewResultInput): Promise<TeamTaskActionResult> {
        const task = this.contextReader.requireOpenTask(input.taskId)
        const reviewer = this.contextReader.requireMemberForTask(task.projectId, input.memberId, 'reviewer')
        if (task.reviewerMemberId !== reviewer.id) {
            throw new TeamAcceptanceError(
                'Review result does not match the active reviewer',
                'team_reviewer_mismatch',
                409
            )
        }

        const taskEvents = this.store.teams.listTaskEvents(task.id)
        const acceptanceState = getTaskAcceptanceState(task, taskEvents)
        if (acceptanceState.reviewStatus !== 'requested') {
            throw new TeamAcceptanceError(
                'Review was not requested for this task',
                'team_review_not_requested',
                409
            )
        }

        const project = this.contextReader.requireProject(task.projectId)
        this.contextReader.requireSession(project.managerSessionId, 'team_manager_session_not_found')
        await this.runtime.ensurePassiveInternalUserMessageTarget(project.managerSessionId)
        const now = Date.now()
        const nextTask = createReviewResultTask(task, input.decision, now)
        const summary = input.summary.trim()
        const result = this.coordinator.applyCommand({
            type: 'upsert-task',
            task: nextTask,
            event: this.contextReader.createTaskEvent(nextTask.projectId, {
                kind: input.decision === 'accept' ? 'review-passed' : 'review-failed',
                actorType: 'member',
                actorId: reviewer.id,
                targetId: nextTask.id,
                payload: {
                    reviewerMemberId: reviewer.id,
                    summary
                },
                createdAt: now
            }),
            affectedSessionIds: compactSessionIds([
                project.managerSessionId,
                reviewer.sessionId,
                task.assigneeMemberId ? this.store.teams.getMember(task.assigneeMemberId)?.sessionId : null
            ])
        })

        await this.runtime.appendPassiveInternalUserMessage(project.managerSessionId, {
            text: buildManagerReviewNotice(task, reviewer, input.decision, summary),
            meta: buildManagerMeta(project.id, project.managerSessionId, reviewer.id)
        })

        return this.buildTaskActionResult(nextTask.id, result.snapshot)
    }

    async requestVerification(input: RequestTaskVerificationInput): Promise<TeamTaskActionResult> {
        const context = this.contextReader.requireTaskContext(input.taskId, input.managerSessionId)
        const acceptanceState = getTaskAcceptanceState(context.task, context.taskEvents)
        if (acceptanceState.reviewStatus !== 'passed') {
            throw new TeamAcceptanceError(
                'Verification requires a passed review first',
                'team_review_not_passed',
                409
            )
        }

        const verifier = this.contextReader.requireMemberForTask(context.project.id, input.verifierMemberId, 'verifier')
        const now = Date.now()
        const nextTask = createVerificationRequestedTask(context.task, verifier.id, now)
        const result = this.coordinator.applyCommand({
            type: 'upsert-task',
            task: nextTask,
            event: this.contextReader.createTaskEvent(nextTask.projectId, {
                kind: 'verification-requested',
                actorType: 'manager',
                actorId: input.managerSessionId,
                targetId: nextTask.id,
                payload: {
                    verifierMemberId: verifier.id,
                    note: normalizeOptionalText(input.note)
                },
                createdAt: now
            }),
            affectedSessionIds: compactSessionIds([
                input.managerSessionId,
                verifier.sessionId,
                context.assignee?.sessionId
            ])
        })

        await this.runtime.appendInternalUserMessage(verifier.sessionId, {
            text: buildVerificationRequestText(nextTask, input.note),
            meta: buildMemberMeta(verifier, 'verify-request')
        })

        return this.buildTaskActionResult(nextTask.id, result.snapshot)
    }

    async submitVerificationResult(input: SubmitTaskVerificationResultInput): Promise<TeamTaskActionResult> {
        const task = this.contextReader.requireOpenTask(input.taskId)
        const verifier = this.contextReader.requireMemberForTask(task.projectId, input.memberId, 'verifier')
        if (task.verifierMemberId !== verifier.id) {
            throw new TeamAcceptanceError(
                'Verification result does not match the active verifier',
                'team_verifier_mismatch',
                409
            )
        }

        const taskEvents = this.store.teams.listTaskEvents(task.id)
        const acceptanceState = getTaskAcceptanceState(task, taskEvents)
        if (acceptanceState.verificationStatus !== 'requested') {
            throw new TeamAcceptanceError(
                'Verification was not requested for this task',
                'team_verification_not_requested',
                409
            )
        }

        const project = this.contextReader.requireProject(task.projectId)
        this.contextReader.requireSession(project.managerSessionId, 'team_manager_session_not_found')
        await this.runtime.ensurePassiveInternalUserMessageTarget(project.managerSessionId)
        const now = Date.now()
        const nextTask = createVerificationResultTask(task, input.decision, now)
        const summary = input.summary.trim()
        const result = this.coordinator.applyCommand({
            type: 'upsert-task',
            task: nextTask,
            event: this.contextReader.createTaskEvent(nextTask.projectId, {
                kind: input.decision === 'pass' ? 'verification-passed' : 'verification-failed',
                actorType: 'member',
                actorId: verifier.id,
                targetId: nextTask.id,
                payload: {
                    verifierMemberId: verifier.id,
                    summary
                },
                createdAt: now
            }),
            affectedSessionIds: compactSessionIds([
                project.managerSessionId,
                verifier.sessionId,
                task.assigneeMemberId ? this.store.teams.getMember(task.assigneeMemberId)?.sessionId : null
            ])
        })

        await this.runtime.appendPassiveInternalUserMessage(project.managerSessionId, {
            text: buildManagerVerificationNotice(task, verifier, input.decision, summary),
            meta: buildManagerMeta(project.id, project.managerSessionId, verifier.id)
        })

        return this.buildTaskActionResult(nextTask.id, result.snapshot)
    }

    async acceptTask(input: AcceptTeamTaskInput): Promise<TeamTaskActionResult> {
        const context = this.contextReader.requireTaskContext(input.taskId, input.managerSessionId)
        const acceptanceState = getTaskAcceptanceState(context.task, context.taskEvents)
        if (acceptanceState.reviewStatus !== 'passed') {
            throw new TeamAcceptanceError(
                'Manager acceptance requires a passed review first',
                'team_review_not_passed',
                409
            )
        }

        const skipVerificationReason = normalizeOptionalText(input.skipVerificationReason)
        if (acceptanceState.verificationStatus !== 'passed' && !skipVerificationReason) {
            throw new TeamAcceptanceError(
                'Verification must pass before final acceptance, unless skipped explicitly',
                'team_verification_required',
                409
            )
        }

        const now = Date.now()
        const nextTask = createAcceptedTask(context.task, now)
        const result = this.coordinator.applyCommand({
            type: 'upsert-task',
            task: nextTask,
            event: this.contextReader.createTaskEvent(nextTask.projectId, {
                kind: 'manager-accepted',
                actorType: 'manager',
                actorId: input.managerSessionId,
                targetId: nextTask.id,
                payload: {
                    summary: normalizeOptionalText(input.summary),
                    skipVerificationReason
                },
                createdAt: now
            }),
            affectedSessionIds: compactSessionIds([
                input.managerSessionId,
                context.assignee?.sessionId,
                nextTask.reviewerMemberId ? this.store.teams.getMember(nextTask.reviewerMemberId)?.sessionId : null,
                nextTask.verifierMemberId ? this.store.teams.getMember(nextTask.verifierMemberId)?.sessionId : null
            ])
        })

        return this.buildTaskActionResult(nextTask.id, result.snapshot)
    }
}
