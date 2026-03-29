/**
 * Sync Engine for VIBY Hub (Direct Connect)
 *
 * In the direct-connect architecture:
 * - viby-hub is the hub (Socket.IO + REST)
 * - viby CLI connects directly to the hub (no relay)
 * - No E2E encryption; data is stored as JSON in SQLite
 */

import {
    getSessionLifecycleState,
    getSessionActivityKind,
    shouldMessageAdvanceSessionUpdatedAt
} from '@viby/protocol'
import type {
    CodexCollaborationMode,
    DecryptedMessage,
    MessageMeta,
    PermissionMode,
    Session,
    TeamMemberRecord,
    TeamProjectSnapshot,
    TeamSessionSpawnRole,
    TeamTaskRecord,
    SessionRecoveryPage,
    SessionMessageActivity,
    SyncEvent
} from '@viby/protocol/types'
import type { Server } from 'socket.io'
import type { Store } from '../store'
import type { RpcRegistry } from '../socket/rpcRegistry'
import { EventPublisher, type SyncEventBroadcaster, type SyncEventListener } from './eventPublisher'
import { MachineCache, type Machine } from './machineCache'
import { MessageService } from './messageService'
import {
    RpcGateway,
    type RpcCommandResponse,
    type RpcDeleteUploadResponse,
    type RpcListDirectoryResponse,
    type RpcMachineDirectoryResponse,
    type RpcPathExistsResponse,
    type RpcReadFileResponse,
    type RpcUploadFileResponse
} from './rpcGateway'
import { SessionCache } from './sessionCache'
import {
    SessionLifecycleService,
    type ResumeContractState,
    type ResumeSessionResult
} from './sessionLifecycleService'
import {
    TeamMemberSessionService,
    type InactiveTeamMemberLaunchPlan,
    type InactiveTeamMemberLaunchRequest,
    type RevisionCarryoverMessageInput
} from './teamMemberSessionService'
import {
    TeamAcceptanceError,
    TeamAcceptanceService,
    type AcceptTeamTaskInput,
    type RequestTaskReviewInput,
    type RequestTaskVerificationInput,
    type SubmitTaskReviewResultInput,
    type SubmitTaskVerificationResultInput
} from './teamAcceptanceService'
import { TeamCoordinatorService } from './teamCoordinatorService'
import {
    TeamLifecycleError,
    TeamLifecycleService
} from './teamLifecycleService'
import {
    TeamOrchestrationError,
    TeamOrchestrationService,
    type CloseTeamProjectInput,
    type CreateTeamRoleInput,
    type CreateTeamTaskInput,
    type DeleteTeamRoleInput,
    type ExportTeamProjectPresetInput,
    type ImportTeamProjectPresetInput,
    type MessageTeamMemberInput,
    type SpawnTeamMemberInput,
    type UpdateTeamProjectSettingsInput,
    type UpdateTeamMemberInput,
    type UpdateTeamRoleInput,
    type UpdateTeamTaskInput
} from './teamOrchestrationService'
import {
    buildHandbackNoticeText,
    buildHandbackSummary,
    resolveManagerInstructionBlock
} from './teamControlSemantics'

export type { Session, SyncEvent } from '@viby/protocol/types'
export type { Machine } from './machineCache'
export type { SyncEventListener } from './eventPublisher'
export type {
    RpcCommandResponse,
    RpcDeleteUploadResponse,
    RpcListDirectoryResponse,
    RpcMachineDirectoryResponse,
    RpcPathExistsResponse,
    RpcReadFileResponse,
    RpcUploadFileResponse
} from './rpcGateway'
export type {
    InactiveTeamMemberLaunchPlan,
    InactiveTeamMemberLaunchRequest,
    RevisionCarryoverMessageInput
} from './teamMemberSessionService'
export type {
    AcceptTeamTaskInput,
    RequestTaskReviewInput,
    RequestTaskVerificationInput,
    SubmitTaskReviewResultInput,
    SubmitTaskVerificationResultInput
} from './teamAcceptanceService'
export { TeamAcceptanceError } from './teamAcceptanceService'
export { TeamLifecycleError } from './teamLifecycleService'
export type {
    CloseTeamProjectInput,
    CreateTeamRoleInput,
    CreateTeamTaskInput,
    DeleteTeamRoleInput,
    ExportTeamProjectPresetInput,
    ImportTeamProjectPresetInput,
    MessageTeamMemberInput,
    SpawnTeamMemberInput,
    UpdateTeamProjectSettingsInput,
    UpdateTeamMemberInput,
    UpdateTeamRoleInput,
    UpdateTeamTaskInput
} from './teamOrchestrationService'
export { TeamOrchestrationError } from './teamOrchestrationService'

export type SessionSendMessageErrorCode =
    | Extract<ResumeSessionResult, { type: 'error' }>['code']
    | 'session_not_found'
    | 'team_member_control_conflict'

export type TeamMemberControlErrorCode =
    | 'team_member_not_found'
    | 'team_member_inactive'
    | 'team_member_control_conflict'
    | 'team_session_not_found'

type GetOrCreateSessionOptions = Parameters<SessionCache['getOrCreateSession']>[0] & {
    sessionRole?: TeamSessionSpawnRole
}

type TeamInterjectPayload = {
    text: string
    localId?: string | null
}

type TeamMemberTarget = {
    member: TeamMemberRecord
    snapshot: TeamProjectSnapshot
    currentTask: TeamTaskRecord | null
}

export class SessionSendMessageError extends Error {
    readonly code: SessionSendMessageErrorCode
    readonly status: 404 | 409

    constructor(message: string, code: SessionSendMessageErrorCode, status: 404 | 409) {
        super(message)
        this.name = 'SessionSendMessageError'
        this.code = code
        this.status = status
    }
}

export class TeamMemberControlError extends Error {
    readonly code: TeamMemberControlErrorCode
    readonly status: 404 | 409

    constructor(message: string, code: TeamMemberControlErrorCode, status: 404 | 409) {
        super(message)
        this.name = 'TeamMemberControlError'
        this.code = code
        this.status = status
    }
}

export class SyncEngine {
    private static readonly SWITCH_CONTRACT_TIMEOUT_MS = 3_000

    private readonly store: Store
    private readonly eventPublisher: EventPublisher
    private readonly sessionCache: SessionCache
    private readonly machineCache: MachineCache
    private readonly messageService: MessageService
    private readonly rpcGateway: RpcGateway
    private readonly sessionLifecycleService: SessionLifecycleService
    private readonly teamMemberSessionService: TeamMemberSessionService
    private readonly teamCoordinatorService: TeamCoordinatorService
    private readonly teamLifecycleService: TeamLifecycleService
    private readonly teamAcceptanceService: TeamAcceptanceService
    private readonly teamOrchestrationService: TeamOrchestrationService
    private inactivityTimer: NodeJS.Timeout | null = null

    constructor(
        store: Store,
        io: Server,
        rpcRegistry: RpcRegistry,
        broadcaster: SyncEventBroadcaster
    ) {
        this.store = store
        this.eventPublisher = new EventPublisher(broadcaster)
        this.sessionCache = new SessionCache(store, this.eventPublisher)
        this.machineCache = new MachineCache(store, this.eventPublisher)
        this.messageService = new MessageService(store, io, this.eventPublisher)
        this.rpcGateway = new RpcGateway(io, rpcRegistry)
        this.teamMemberSessionService = new TeamMemberSessionService(store)
        this.teamCoordinatorService = new TeamCoordinatorService(store, (event) => {
            this.handleRealtimeEvent(event)
        })
        this.teamAcceptanceService = new TeamAcceptanceService(
            store,
            this.teamCoordinatorService,
            {
                appendInternalUserMessage: async (sessionId, payload) => {
                    await this.appendInternalUserMessage(sessionId, payload)
                },
                appendPassiveInternalUserMessage: async (sessionId, payload) => {
                    await this.appendPassiveInternalUserMessage(sessionId, payload)
                },
                ensurePassiveInternalUserMessageTarget: async (sessionId) => {
                    await this.ensurePassiveInternalUserMessageTarget(sessionId)
                }
            }
        )
        this.sessionLifecycleService = new SessionLifecycleService(
            this.sessionCache,
            this.machineCache,
            this.rpcGateway
        )
        this.teamLifecycleService = new TeamLifecycleService(
            store,
            this.sessionCache,
            this.sessionLifecycleService,
            this.teamCoordinatorService
        )
        this.teamOrchestrationService = new TeamOrchestrationService(
            store,
            this.teamCoordinatorService,
            this.teamMemberSessionService,
            this.teamLifecycleService,
            async (options) => await this.spawnSession(options),
            async (sessionId, payload) => await this.appendInternalUserMessage(sessionId, payload),
            (sessionId) => this.getSession(sessionId)
        )
        this.reloadAll()
        this.inactivityTimer = setInterval(() => this.expireInactive(), 5_000)
    }

    stop(): void {
        if (this.inactivityTimer) {
            clearInterval(this.inactivityTimer)
            this.inactivityTimer = null
        }
    }

    subscribe(listener: SyncEventListener): () => void {
        return this.eventPublisher.subscribe(listener)
    }

    getSessions(): Session[] {
        return this.sessionCache.getSessions()
    }

    getSession(sessionId: string): Session | undefined {
        return this.sessionCache.getSession(sessionId) ?? this.sessionCache.refreshSession(sessionId) ?? undefined
    }

    getActiveSessions(): Session[] {
        return this.sessionCache.getActiveSessions()
    }

    getMachines(): Machine[] {
        return this.machineCache.getMachines()
    }

    getMachine(machineId: string): Machine | undefined {
        return this.machineCache.getMachine(machineId)
    }

    getOnlineMachines(): Machine[] {
        return this.machineCache.getOnlineMachines()
    }

    getMessagesPage(sessionId: string, options: { limit: number; beforeSeq: number | null }): {
        messages: DecryptedMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
        }
    } {
        return this.messageService.getMessagesPage(sessionId, options)
    }

    getMessagesAfter(sessionId: string, options: { afterSeq: number; limit: number }): DecryptedMessage[] {
        return this.messageService.getMessagesAfter(sessionId, options)
    }

    getTeamProjectSnapshot(projectId: string): TeamProjectSnapshot | null {
        return this.teamCoordinatorService.getProjectSnapshot(projectId)
    }

    getTeamProjectHistory(projectId: string) {
        return this.teamLifecycleService.getProjectHistory(projectId)
    }

    getSessionRecoveryPage(sessionId: string, options: { afterSeq: number; limit: number }): SessionRecoveryPage {
        const session = this.getSession(sessionId)
        if (!session) {
            throw new Error('Session not found')
        }

        const messages = this.messageService.getMessagesAfter(sessionId, options)
        const nextAfterSeq = messages.reduce((cursor, message) => {
            if (typeof message.seq === 'number' && message.seq > cursor) {
                return message.seq
            }
            return cursor
        }, options.afterSeq)

        return {
            session,
            messages,
            page: {
                afterSeq: options.afterSeq,
                nextAfterSeq,
                limit: options.limit,
                hasMore: messages.length >= options.limit
            }
        }
    }

    getSessionMessageActivities(sessionIds: string[]): Record<string, SessionMessageActivity> {
        return this.messageService.getSessionMessageActivities(sessionIds)
    }

    handleRealtimeEvent(event: SyncEvent): void {
        if (event.type === 'session-updated' && event.sessionId) {
            this.sessionCache.refreshSession(event.sessionId)
            return
        }

        if (event.type === 'machine-updated' && event.machineId) {
            this.machineCache.refreshMachine(event.machineId)
            return
        }

        if (event.type === 'message-received' && event.sessionId) {
            const cachedSession = this.sessionCache.getSession(event.sessionId)
            const activityKind = getSessionActivityKind(event.message.content)
            if (!cachedSession || shouldMessageAdvanceSessionUpdatedAt(activityKind)) {
                this.sessionCache.refreshSession(event.sessionId)
            }
        }

        this.eventPublisher.emit(event)
    }

    handleSessionAlive(payload: {
        sid: string
        time: number
        thinking?: boolean
        mode?: 'local' | 'remote'
        permissionMode?: PermissionMode
        model?: string | null
        modelReasoningEffort?: Session['modelReasoningEffort']
        collaborationMode?: CodexCollaborationMode
    }): void {
        this.sessionCache.handleSessionAlive(payload)
    }

    handleSessionEnd(payload: { sid: string; time: number }): void {
        this.sessionCache.handleSessionEnd(payload)
    }

    handleMachineAlive(payload: { machineId: string; time: number }): void {
        this.machineCache.handleMachineAlive(payload)
    }

    private expireInactive(): void {
        this.sessionCache.expireInactive()
        this.machineCache.expireInactive()
    }

    private reloadAll(): void {
        this.sessionCache.reloadAll()
        this.machineCache.reloadAll()
    }

    getOrCreateSession(options: GetOrCreateSessionOptions): Session {
        const { sessionRole, ...sessionOptions } = options
        const session = this.sessionCache.getOrCreateSession(sessionOptions)

        if (sessionRole === 'manager') {
            this.teamCoordinatorService.ensureManagerProject(session)
            return this.getSession(session.id) ?? session
        }

        return session
    }

    getOrCreateMachine(id: string, metadata: unknown, runnerState: unknown): Machine {
        return this.machineCache.getOrCreateMachine(id, metadata, runnerState)
    }

    private async ensureSessionReadyForSend(sessionId: string): Promise<Session> {
        const session = this.getSession(sessionId)
        if (!session) {
            throw new SessionSendMessageError('Session not found', 'session_not_found', 404)
        }

        if (session.active) {
            return session
        }

        const shouldFreshStart = !this.messageService.hasMessages(sessionId)

        if (getSessionLifecycleState(session) === 'archived') {
            await this.unarchiveSession(sessionId)
        }

        const resumeResult = shouldFreshStart
            ? await this.sessionLifecycleService.startSession(sessionId)
            : await this.resumeSession(sessionId)
        if (resumeResult.type !== 'success') {
            throw new SessionSendMessageError(
                resumeResult.message,
                resumeResult.code,
                resumeResult.code === 'session_not_found' ? 404 : 409
            )
        }

        const resumedSession = this.getSession(resumeResult.sessionId)
        if (!resumedSession) {
            throw new SessionSendMessageError('Session not found', 'session_not_found', 404)
        }
        if (!resumedSession.active) {
            throw new SessionSendMessageError(
                'Session remained inactive after resume',
                'resume_failed',
                409
            )
        }

        return resumedSession
    }

    async sendMessage(
        sessionId: string,
        payload: {
            text: string
            localId?: string | null
            attachments?: Array<{
                id: string
                filename: string
                mimeType: string
                size: number
                path: string
                previewUrl?: string
            }>
            sentFrom?: 'webapp'
        }
    ): Promise<Session> {
        this.ensureGenericSendAllowed(sessionId)
        return await this.appendInternalUserMessage(sessionId, {
            text: payload.text,
            localId: payload.localId,
            attachments: payload.attachments,
            meta: {
                sentFrom: payload.sentFrom ?? 'webapp'
            }
        })
    }

    async appendInternalUserMessage(
        sessionId: string,
        payload: {
            text: string
            localId?: string | null
            attachments?: Array<{
                id: string
                filename: string
                mimeType: string
                size: number
                path: string
                previewUrl?: string
            }>
            meta?: MessageMeta
        }
    ): Promise<Session> {
        const readySession = await this.ensureSessionReadyForSend(sessionId)
        await this.messageService.appendUserMessage(sessionId, payload)
        this.sessionCache.refreshSession(sessionId)
        return this.getSession(sessionId) ?? readySession
    }

    async interjectTeamMember(memberId: string, payload: TeamInterjectPayload): Promise<Session> {
        const target = this.requireTeamMemberTarget(memberId, { requireManagerControl: true })
        await this.ensurePassiveInternalUserMessageTarget(target.member.managerSessionId)
        const noticeMeta = this.buildTeamMessageMeta(target.member, 'manager', {
            sentFrom: 'team-system',
            teamMessageKind: 'system-event',
            controlOwner: target.member.controlOwner
        })
        const interjectionText = payload.text.trim()

        this.teamCoordinatorService.applyCommand({
            type: 'record-event',
            event: {
                id: crypto.randomUUID(),
                projectId: target.member.projectId,
                kind: 'user-interjected',
                actorType: 'user',
                actorId: null,
                targetType: 'member',
                targetId: target.member.id,
                payload: {
                    text: interjectionText
                },
                createdAt: Date.now()
            },
            affectedSessionIds: [target.member.managerSessionId, target.member.sessionId]
        })

        await this.appendInternalUserMessage(target.member.sessionId, {
            text: interjectionText,
            localId: payload.localId,
            meta: this.buildTeamMessageMeta(target.member, 'member', {
                sentFrom: 'user',
                teamMessageKind: 'coordination',
                controlOwner: target.member.controlOwner
            })
        })

        await this.appendPassiveInternalUserMessage(
            target.member.managerSessionId,
            {
                text: this.buildManagerNoticeText('interject', target, interjectionText),
                meta: noticeMeta
            }
        )

        return this.requireSessionSnapshot(target.member.sessionId)
    }

    async takeOverTeamMember(memberId: string): Promise<Session> {
        const target = this.requireTeamMemberTarget(memberId)
        if (target.member.controlOwner === 'user') {
            return this.requireSessionSnapshot(target.member.sessionId)
        }
        await this.ensurePassiveInternalUserMessageTarget(target.member.managerSessionId)

        const nextMember: TeamMemberRecord = {
            ...target.member,
            controlOwner: 'user',
            updatedAt: Date.now()
        }

        this.teamCoordinatorService.applyCommand({
            type: 'upsert-member',
            member: nextMember,
            event: {
                id: crypto.randomUUID(),
                projectId: nextMember.projectId,
                kind: 'user-takeover-started',
                actorType: 'user',
                actorId: null,
                targetType: 'member',
                targetId: nextMember.id,
                payload: null,
                createdAt: nextMember.updatedAt
            },
            affectedSessionIds: [nextMember.managerSessionId, nextMember.sessionId]
        })

        await this.appendPassiveInternalUserMessage(
            nextMember.managerSessionId,
            {
                text: this.buildManagerNoticeText('takeover', {
                    ...target,
                    member: nextMember
                }),
                meta: this.buildTeamMessageMeta(nextMember, 'manager', {
                    sentFrom: 'team-system',
                    teamMessageKind: 'system-event',
                    controlOwner: 'user'
                })
            }
        )

        return this.requireSessionSnapshot(nextMember.sessionId)
    }

    async returnTeamMember(memberId: string): Promise<Session> {
        const target = this.requireTeamMemberTarget(memberId)
        if (target.member.controlOwner === 'manager') {
            return this.requireSessionSnapshot(target.member.sessionId)
        }
        await this.ensurePassiveInternalUserMessageTarget(target.member.managerSessionId)
        const handbackSummary = buildHandbackSummary(this.store, target.member, {
            session: this.getSession(target.member.sessionId),
            currentTask: target.currentTask
        })

        const nextMember: TeamMemberRecord = {
            ...target.member,
            controlOwner: 'manager',
            updatedAt: Date.now()
        }

        this.teamCoordinatorService.applyCommand({
            type: 'upsert-member',
            member: nextMember,
            event: {
                id: crypto.randomUUID(),
                projectId: nextMember.projectId,
                kind: 'user-takeover-ended',
                actorType: 'user',
                actorId: null,
                targetType: 'member',
                targetId: nextMember.id,
                payload: {
                    summary: handbackSummary
                },
                createdAt: nextMember.updatedAt
            },
            affectedSessionIds: [nextMember.managerSessionId, nextMember.sessionId]
        })

        await this.appendPassiveInternalUserMessage(
            nextMember.managerSessionId,
            {
                text: buildHandbackNoticeText(nextMember, handbackSummary, target.currentTask),
                meta: this.buildTeamMessageMeta(nextMember, 'manager', {
                    sentFrom: 'team-system',
                    teamMessageKind: 'system-event',
                    controlOwner: 'manager'
                })
            }
        )

        return this.requireSessionSnapshot(nextMember.sessionId)
    }

    async requestTaskReview(input: RequestTaskReviewInput): Promise<TeamTaskRecord> {
        const result = await this.teamAcceptanceService.requestReview(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            result.task.reviewerMemberId ? this.store.teams.getMember(result.task.reviewerMemberId)?.sessionId : null
        ])
        return result.task
    }

    async submitTaskReviewResult(input: SubmitTaskReviewResultInput): Promise<TeamTaskRecord> {
        const result = await this.teamAcceptanceService.submitReviewResult(input)
        this.sessionCache.refreshSession(result.snapshot.project.managerSessionId)
        return result.task
    }

    async requestTaskVerification(input: RequestTaskVerificationInput): Promise<TeamTaskRecord> {
        const result = await this.teamAcceptanceService.requestVerification(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            result.task.verifierMemberId ? this.store.teams.getMember(result.task.verifierMemberId)?.sessionId : null
        ])
        return result.task
    }

    async submitTaskVerificationResult(input: SubmitTaskVerificationResultInput): Promise<TeamTaskRecord> {
        const result = await this.teamAcceptanceService.submitVerificationResult(input)
        this.sessionCache.refreshSession(result.snapshot.project.managerSessionId)
        return result.task
    }

    async acceptTeamTask(input: AcceptTeamTaskInput): Promise<TeamTaskRecord> {
        const result = await this.teamAcceptanceService.acceptTask(input)
        this.sessionCache.refreshSession(input.managerSessionId)
        return result.task
    }

    async spawnTeamMember(input: SpawnTeamMemberInput) {
        const result = await this.teamOrchestrationService.spawnMember(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            result.member.sessionId,
            ...result.snapshot.members.map((member) => member.sessionId)
        ])
        return result
    }

    async updateTeamMember(input: UpdateTeamMemberInput) {
        const result = await this.teamOrchestrationService.updateMember(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            ...result.snapshot.members.map((member) => member.sessionId)
        ])
        return result
    }


    async createTeamRole(input: CreateTeamRoleInput) {
        const result = await this.teamOrchestrationService.createRole(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            ...result.snapshot.members.map((member) => member.sessionId)
        ])
        return result.role
    }

    async updateTeamRole(input: UpdateTeamRoleInput) {
        const result = await this.teamOrchestrationService.updateRole(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            ...result.snapshot.members.map((member) => member.sessionId)
        ])
        return result.role
    }

    async deleteTeamRole(input: DeleteTeamRoleInput) {
        const result = await this.teamOrchestrationService.deleteRole(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            ...result.snapshot.members.map((member) => member.sessionId)
        ])
        return result.roleId
    }


    async exportTeamProjectPreset(input: ExportTeamProjectPresetInput) {
        return await this.teamOrchestrationService.exportProjectPreset(input)
    }

    async importTeamProjectPreset(input: ImportTeamProjectPresetInput): Promise<TeamProjectSnapshot> {
        const result = await this.teamOrchestrationService.importProjectPreset(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            ...result.snapshot.members.map((member) => member.sessionId)
        ])
        return result.snapshot
    }

    async createTeamTask(input: CreateTeamTaskInput): Promise<TeamTaskRecord> {
        const result = await this.teamOrchestrationService.createTask(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            ...result.snapshot.members.map((member) => member.sessionId)
        ])
        return result.task
    }

    async updateTeamProjectSettings(input: UpdateTeamProjectSettingsInput): Promise<TeamProjectSnapshot> {
        const result = await this.teamOrchestrationService.updateProjectSettings(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            ...result.snapshot.members.map((member) => member.sessionId)
        ])
        return result.snapshot
    }

    async updateTeamTask(input: UpdateTeamTaskInput): Promise<TeamTaskRecord> {
        const result = await this.teamOrchestrationService.updateTask(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            ...result.snapshot.members.map((member) => member.sessionId)
        ])
        return result.task
    }

    async messageTeamMember(input: MessageTeamMemberInput) {
        const result = await this.teamOrchestrationService.messageMember(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            result.member.sessionId,
            ...result.snapshot.members.map((member) => member.sessionId)
        ])
        return result
    }

    async closeTeamProject(input: CloseTeamProjectInput) {
        const result = await this.teamOrchestrationService.closeProject(input)
        this.refreshTeamSessions([
            input.managerSessionId,
            ...result.snapshot.members.map((member) => member.sessionId)
        ])
        return result
    }

    async approvePermission(
        sessionId: string,
        requestId: string,
        mode?: PermissionMode,
        allowTools?: string[],
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
        answers?: Record<string, string[]> | Record<string, { answers: string[] }>
    ): Promise<void> {
        await this.rpcGateway.approvePermission(sessionId, requestId, mode, allowTools, decision, answers)
    }

    async denyPermission(
        sessionId: string,
        requestId: string,
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    ): Promise<void> {
        await this.rpcGateway.denyPermission(sessionId, requestId, decision)
    }

    async abortSession(sessionId: string): Promise<Session> {
        await this.rpcGateway.abortSession(sessionId)
        const session = this.sessionCache.setSessionThinking(sessionId, false)
        if (!session) {
            throw new Error('Session not found')
        }
        return session
    }

    async closeSession(sessionId: string): Promise<Session> {
        return await this.sessionLifecycleService.closeSession(sessionId)
    }

    async archiveSession(sessionId: string): Promise<Session> {
        return await this.teamLifecycleService.archiveSession(sessionId)
    }

    async unarchiveSession(sessionId: string): Promise<Session> {
        return await this.teamLifecycleService.unarchiveSession(sessionId)
    }

    private async waitForSwitchedSession(sessionId: string, to: 'remote' | 'local'): Promise<Session> {
        const expectsControlledByUser = to === 'local'
        const current = this.getSession(sessionId)
        if (current?.active && current.agentState?.controlledByUser === expectsControlledByUser) {
            return current
        }

        return await this.sessionCache.waitForSessionCondition(sessionId, {
            timeoutMs: SyncEngine.SWITCH_CONTRACT_TIMEOUT_MS,
            resolveValue: () => {
                const session = this.getSession(sessionId)
                if (!session?.active || session.agentState?.controlledByUser !== expectsControlledByUser) {
                    return null
                }
                return session
            },
            onTimeout: () => {
                throw new Error(`Session switch did not reach ${to} mode`)
            },
            isRelevantEvent: (event) => event.type === 'session-added' || event.type === 'session-updated'
        })
    }

    async switchSession(sessionId: string, to: 'remote' | 'local'): Promise<Session> {
        await this.rpcGateway.switchSession(sessionId, to)
        return await this.waitForSwitchedSession(sessionId, to)
    }

    async renameSession(sessionId: string, name: string): Promise<Session> {
        return await this.sessionCache.renameSession(sessionId, name)
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.sessionCache.deleteSession(sessionId)
    }

    async applySessionConfig(
        sessionId: string,
        config: {
            permissionMode?: PermissionMode
            model?: string | null
            modelReasoningEffort?: Session['modelReasoningEffort']
            collaborationMode?: CodexCollaborationMode
        }
    ): Promise<void> {
        const result = await this.rpcGateway.requestSessionConfig(sessionId, config)
        if (!result || typeof result !== 'object') {
            throw new Error('Invalid response from session config RPC')
        }
        const obj = result as {
            applied?: {
                permissionMode?: Session['permissionMode']
                model?: Session['model']
                modelReasoningEffort?: Session['modelReasoningEffort']
                collaborationMode?: Session['collaborationMode']
            }
        }
        const applied = obj.applied
        if (!applied || typeof applied !== 'object') {
            throw new Error('Missing applied session config')
        }

        this.sessionCache.applySessionConfig(sessionId, applied)
    }

    planInactiveTeamMemberLaunch(request: InactiveTeamMemberLaunchRequest): InactiveTeamMemberLaunchPlan {
        return this.teamMemberSessionService.planInactiveLaunch(request)
    }

    async appendTeamRevisionCarryoverMessage(
        sessionId: string,
        input: RevisionCarryoverMessageInput
    ): Promise<Session> {
        return await this.appendInternalUserMessage(
            sessionId,
            this.teamMemberSessionService.buildRevisionCarryoverMessage(input)
        )
    }

    async spawnSession(options: {
        sessionId?: string
        machineId: string
        directory: string
        agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
        model?: string
        modelReasoningEffort?: Session['modelReasoningEffort']
        permissionMode?: PermissionMode
        sessionRole?: TeamSessionSpawnRole
        sessionType?: 'simple' | 'worktree'
        worktreeName?: string
        resumeSessionId?: string
        collaborationMode?: CodexCollaborationMode
    }): Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }> {
        return await this.rpcGateway.spawnSession(options)
    }

    private async appendPassiveInternalUserMessage(
        sessionId: string,
        payload: {
            text: string
            localId?: string | null
            attachments?: Array<{
                id: string
                filename: string
                mimeType: string
                size: number
                path: string
                previewUrl?: string
            }>
            meta?: MessageMeta
        }
    ): Promise<Session> {
        const readySession = await this.ensurePassiveInternalUserMessageTarget(sessionId)
        await this.messageService.appendUserMessage(sessionId, payload)
        this.sessionCache.refreshSession(sessionId)
        return this.getSession(sessionId) ?? readySession
    }

    private ensureGenericSendAllowed(sessionId: string): void {
        const member = this.store.teams.getMemberBySessionId(sessionId)
        if (!member || member.controlOwner === 'user') {
            return
        }

        const instructionBlock = member.membershipState === 'active'
            ? resolveManagerInstructionBlock(this.store, member)
            : null
        throw new SessionSendMessageError(
            instructionBlock?.kind === 'pending_interject'
                ? 'Team member is still completing a user interjection'
                : 'Team member is currently under manager control',
            'team_member_control_conflict',
            409
        )
    }

    private async ensurePassiveInternalUserMessageTarget(sessionId: string): Promise<Session> {
        const existingSession = this.getSession(sessionId)
        if (!existingSession) {
            throw new TeamMemberControlError('Session not found', 'team_session_not_found', 404)
        }
        if (existingSession.active) {
            return existingSession
        }

        return await this.ensureSessionReadyForSend(sessionId)
    }

    private buildTeamMessageMeta(
        member: TeamMemberRecord,
        sessionRole: 'manager' | 'member',
        overrides: Pick<MessageMeta, 'sentFrom' | 'teamMessageKind' | 'controlOwner'>
    ): MessageMeta {
        return {
            sentFrom: overrides.sentFrom,
            teamProjectId: member.projectId,
            managerSessionId: member.managerSessionId,
            memberId: member.id,
            sessionRole,
            teamMessageKind: overrides.teamMessageKind,
            controlOwner: overrides.controlOwner
        }
    }

    private buildManagerNoticeText(
        action: 'interject' | 'takeover' | 'return',
        target: TeamMemberTarget,
        interjectionText?: string
    ): string {
        const memberLabel = `${target.member.role} 成员`
        const taskTitle = target.currentTask?.title ?? null
        const taskSuffix = taskTitle ? ` 当前任务：${taskTitle}。` : ''

        if (action === 'interject') {
            return `用户向 ${memberLabel} 插话：${interjectionText ?? ''}${taskSuffix}`.trim()
        }
        if (action === 'takeover') {
            return `用户已接管 ${memberLabel}。经理需暂停继续向该成员下发指令。${taskSuffix}`.trim()
        }

        return `用户已将 ${memberLabel} 归还给经理。请先阅读接管期间的最新 transcript，再从当前状态继续。${taskSuffix}`.trim()
    }

    private requireSessionSnapshot(sessionId: string): Session {
        const session = this.getSession(sessionId)
        if (!session) {
            throw new TeamMemberControlError('Session not found', 'team_session_not_found', 404)
        }

        return session
    }

    private requireTeamMemberTarget(
        memberId: string,
        options?: { requireManagerControl?: boolean }
    ): TeamMemberTarget {
        const member = this.teamCoordinatorService.getMember(memberId)
        if (!member) {
            throw new TeamMemberControlError('Team member not found', 'team_member_not_found', 404)
        }
        if (member.membershipState !== 'active') {
            throw new TeamMemberControlError('Team member is not active', 'team_member_inactive', 409)
        }
        if (options?.requireManagerControl) {
            const instructionBlock = resolveManagerInstructionBlock(this.store, member)
            if (instructionBlock) {
                throw new TeamMemberControlError(
                    instructionBlock.kind === 'pending_interject'
                        ? 'Team member is still completing a user interjection'
                        : 'Team member is currently under user control',
                    'team_member_control_conflict',
                    409
                )
            }
        }

        const snapshot = this.teamCoordinatorService.getProjectSnapshot(member.projectId)
        if (!snapshot) {
            throw new TeamMemberControlError('Team member not found', 'team_member_not_found', 404)
        }

        this.requireSessionSnapshot(member.sessionId)
        this.requireSessionSnapshot(member.managerSessionId)

        return {
            member,
            snapshot,
            currentTask: member.spawnedForTaskId
                ? snapshot.tasks.find((task) => task.id === member.spawnedForTaskId) ?? null
                : null
        }
    }

    private refreshTeamSessions(sessionIds: Array<string | null | undefined>): void {
        for (const sessionId of sessionIds) {
            if (!sessionId) {
                continue
            }
            this.sessionCache.refreshSession(sessionId)
        }
    }

    private async cleanupFailedResumeSpawn(
        originalSessionId: string,
        spawnedSessionId: string,
        resumeToken: string
    ): Promise<string | null> {
        return await this.sessionLifecycleService.defaultCleanupFailedResumeSpawn(
            originalSessionId,
            spawnedSessionId,
            resumeToken
        )
    }

    private async waitForResumedSessionContract(
        sessionId: string,
        resumeToken: string,
        timeoutMs?: number
    ): Promise<ResumeContractState> {
        return await this.sessionLifecycleService.defaultWaitForResumedSessionContract(
            sessionId,
            resumeToken,
            timeoutMs
        )
    }

    private async writeSessionResumeToken(sessionId: string, token: string | undefined): Promise<void> {
        await this.sessionLifecycleService.defaultWriteSessionResumeToken(sessionId, token)
    }

    async resumeSession(sessionId: string): Promise<ResumeSessionResult> {
        return await this.sessionLifecycleService.resumeSession(sessionId, {
            cleanupFailedResumeSpawn: async (originalSessionId, spawnedSessionId, resumeToken) => {
                return await this.cleanupFailedResumeSpawn(
                    originalSessionId,
                    spawnedSessionId,
                    resumeToken
                )
            },
            waitForResumedSessionContract: async (targetSessionId, resumeToken, timeoutMs) => {
                return await this.waitForResumedSessionContract(
                    targetSessionId,
                    resumeToken,
                    timeoutMs
                )
            },
            writeSessionResumeToken: async (targetSessionId, token) => {
                await this.writeSessionResumeToken(targetSessionId, token)
            }
        })
    }

    async checkPathsExist(machineId: string, paths: string[]): Promise<Record<string, boolean>> {
        return await this.rpcGateway.checkPathsExist(machineId, paths)
    }

    async browseMachineDirectory(machineId: string, path?: string): Promise<RpcMachineDirectoryResponse> {
        return await this.rpcGateway.browseMachineDirectory(machineId, path)
    }

    async getGitStatus(sessionId: string, cwd?: string): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitStatus(sessionId, cwd)
    }

    async getGitDiffNumstat(sessionId: string, options: { cwd?: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitDiffNumstat(sessionId, options)
    }

    async getGitDiffFile(sessionId: string, options: { cwd?: string; filePath: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitDiffFile(sessionId, options)
    }

    async readSessionFile(sessionId: string, path: string): Promise<RpcReadFileResponse> {
        return await this.rpcGateway.readSessionFile(sessionId, path)
    }

    async listDirectory(sessionId: string, path: string): Promise<RpcListDirectoryResponse> {
        return await this.rpcGateway.listDirectory(sessionId, path)
    }

    async uploadFile(sessionId: string, filename: string, content: string, mimeType: string): Promise<RpcUploadFileResponse> {
        return await this.rpcGateway.uploadFile(sessionId, filename, content, mimeType)
    }

    async deleteUploadFile(sessionId: string, path: string): Promise<RpcDeleteUploadResponse> {
        return await this.rpcGateway.deleteUploadFile(sessionId, path)
    }

    async runRipgrep(sessionId: string, args: string[], cwd?: string): Promise<RpcCommandResponse> {
        return await this.rpcGateway.runRipgrep(sessionId, args, cwd)
    }

    async listSlashCommands(sessionId: string, agent: string): Promise<{
        success: boolean
        commands?: Array<{ name: string; description?: string; source: 'builtin' | 'user' | 'plugin' | 'project' }>
        error?: string
    }> {
        return await this.rpcGateway.listSlashCommands(sessionId, agent)
    }

    async listSkills(sessionId: string): Promise<{
        success: boolean
        skills?: Array<{ name: string; description?: string }>
        error?: string
    }> {
        return await this.rpcGateway.listSkills(sessionId)
    }
}
