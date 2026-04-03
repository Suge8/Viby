import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { io, type Socket } from 'socket.io-client'
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { z, type ZodType } from 'zod'
import { logger } from '@/ui/logger'
import { backoff } from '@/utils/time'
import { apiValidationError } from '@/utils/errorUtils'
import { AsyncLock } from '@/utils/lock'
import type { RawJSONLines } from '@/claude/types'
import { configuration } from '@/configuration'
import {
    SESSION_RECOVERY_PAGE_SIZE,
    findNextRecoveryCursor,
    SessionTeamContextSchema,
    TerminalClosePayloadSchema,
    TerminalOpenPayloadSchema,
    TeamMemberRecordSchema,
    TeamProjectSchema,
    TeamProjectSnapshotSchema,
    TeamRoleDefinitionSchema,
    TeamRoleIdSchema,
    TeamTaskRecordSchema,
    TerminalResizePayloadSchema,
    TerminalWritePayloadSchema,
    type ClientToServerEvents,
    type ServerToClientEvents,
    type Update
} from '@viby/protocol'
import { SessionSchema } from '@viby/protocol/schemas'
import type {
    AgentState,
    MessageContent,
    MessageMeta,
    Metadata,
    SessionCollaborationMode,
    Session,
    SessionModel,
    SessionModelReasoningEffort,
    SessionPermissionMode,
    UserMessage,
    WritableSessionMetadata
} from './types'
import type {
    SessionTeamContext,
    TeamProjectSnapshot,
    TeamTaskRecord
} from '@viby/protocol/types'
import {
    AgentStateSchema,
    type CliSessionRecoveryResponse,
    CliSessionRecoveryResponseSchema,
    MetadataSchema,
    UserMessageSchema
} from './types'
import { RpcHandlerManager } from './rpc/RpcHandlerManager'
import { registerCommonHandlers } from '../modules/common/registerCommonHandlers'
import { cleanupUploadDir } from '../modules/common/handlers/uploads'
import { TerminalManager } from '@/terminal/TerminalManager'
import { applyVersionedAck } from './versionedUpdate'
import { EMPTY_DRIVER_SWITCH_FIRST_TURN_ERROR } from '@/agent/driverSwitchHandoffState'

const API_SESSION_REQUEST_TIMEOUT_MS = 15_000
const SESSION_STATE_FLUSH_TIMEOUT_MS = 5_000
type MetadataUpdateOptions = {
    touchUpdatedAt?: boolean
}

type SessionKeepAliveRuntime = {
    permissionMode?: SessionPermissionMode
    model?: SessionModel
    modelReasoningEffort?: SessionModelReasoningEffort
    collaborationMode?: SessionCollaborationMode
}

type SessionKeepAliveSnapshot = SessionKeepAliveRuntime & {
    thinking: boolean
    mode: 'local' | 'remote'
}

const TeamTaskActionResponseSchema = z.object({
    ok: z.literal(true),
    task: TeamTaskRecordSchema
})

const TeamMemberLaunchSchema = z.object({
    strategy: z.enum(['spawn', 'resume', 'revision']),
    reason: z.string(),
    previousMemberId: z.string().nullable()
})

const TeamMemberActionResponseSchema = z.object({
    ok: z.literal(true),
    member: TeamMemberRecordSchema,
    session: SessionSchema.optional(),
    launch: TeamMemberLaunchSchema.optional(),
    action: z.enum(['remove', 'replace']).optional(),
    replacedMemberId: z.string().optional()
})

const TeamProjectActionResponseSchema = z.object({
    ok: z.literal(true),
    project: TeamProjectSchema
})

const TeamRoleActionResponseSchema = z.object({
    ok: z.literal(true),
    role: TeamRoleDefinitionSchema
})

const TeamRoleDeleteResponseSchema = z.object({
    ok: z.literal(true),
    roleId: TeamRoleIdSchema
})

const ApiAuthResponseSchema = z.object({
    token: z.string().min(1),
    user: z.object({
        id: z.number()
    })
})

const LIFECYCLE_METADATA_FIELDS = [
    'lifecycleState',
    'lifecycleStateSince',
    'archivedBy',
    'archiveReason'
] as const

function getInitialSessionMode(metadata: Metadata | null): 'local' | 'remote' {
    return metadata?.startedBy === 'runner' || metadata?.startedFromRunner === true
        ? 'remote'
        : 'local'
}

function createInitialKeepAliveSnapshot(session: Session): SessionKeepAliveSnapshot {
    return {
        thinking: session.thinking,
        mode: getInitialSessionMode(session.metadata),
        ...(session.permissionMode !== undefined ? { permissionMode: session.permissionMode } : {}),
        ...(session.model !== undefined ? { model: session.model } : {}),
        ...(session.modelReasoningEffort !== undefined ? { modelReasoningEffort: session.modelReasoningEffort } : {}),
        ...(session.collaborationMode !== undefined ? { collaborationMode: session.collaborationMode } : {})
    }
}

function toSessionAlivePayload(sessionId: string, snapshot: SessionKeepAliveSnapshot): {
    sid: string
    time: number
    thinking: boolean
    mode: 'local' | 'remote'
    permissionMode?: SessionPermissionMode
    model?: SessionModel
    modelReasoningEffort?: SessionModelReasoningEffort
    collaborationMode?: SessionCollaborationMode
} {
    return {
        sid: sessionId,
        time: Date.now(),
        thinking: snapshot.thinking,
        mode: snapshot.mode,
        ...(snapshot.permissionMode !== undefined ? { permissionMode: snapshot.permissionMode } : {}),
        ...(snapshot.model !== undefined ? { model: snapshot.model } : {}),
        ...(snapshot.modelReasoningEffort !== undefined ? { modelReasoningEffort: snapshot.modelReasoningEffort } : {}),
        ...(snapshot.collaborationMode !== undefined ? { collaborationMode: snapshot.collaborationMode } : {})
    }
}

function stripLifecycleMetadataFields<T extends Record<string, unknown>>(metadata: T): T {
    const nextMetadata = { ...metadata }

    for (const field of LIFECYCLE_METADATA_FIELDS) {
        delete nextMetadata[field]
    }

    return nextMetadata
}

function createWritableSessionMetadataSnapshot(
    metadata: Metadata | null
): WritableSessionMetadata {
    if (!metadata) {
        return {} as WritableSessionMetadata
    }

    return stripLifecycleMetadataFields(metadata) as WritableSessionMetadata
}

type SessionStreamClientUpdate =
    | {
        kind: 'append'
        streamId: string
        delta: string
    }
    | {
        kind: 'clear'
        streamId?: string
    }

type DriverSwitchSendFailureStage = 'socket_update' | 'callback_flush'
type DriverSwitchSendFailureCode = 'empty_first_turn' | 'timeout' | 'unknown'

function resolveDriverSwitchSendFailureCode(error: unknown): DriverSwitchSendFailureCode {
    if (error instanceof Error && error.message === EMPTY_DRIVER_SWITCH_FIRST_TURN_ERROR) {
        return 'empty_first_turn'
    }

    if (
        (error instanceof Error && error.name === 'TimeoutError')
        || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ETIMEDOUT')
    ) {
        return 'timeout'
    }

    return 'unknown'
}

export class ApiSessionClient extends EventEmitter {
    private readonly token: string
    readonly sessionId: string
    private teamContextSnapshot: SessionTeamContext | undefined
    private metadata: Metadata | null
    private metadataVersion: number
    private agentState: AgentState | null
    private agentStateVersion: number
    private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>
    private pendingMessages: UserMessage[] = []
    private pendingMessageCallback: ((message: UserMessage) => void) | null = null
    private lastSeenMessageSeq: number | null = null
    private backfillInFlight: Promise<void> | null = null
    private needsBackfill = false
    private hasConnectedOnce = false
    private pendingAutoSummary: { text: string; updatedAt: number } | null = null
    readonly rpcHandlerManager: RpcHandlerManager
    private readonly terminalManager: TerminalManager
    private agentStateLock = new AsyncLock()
    private metadataLock = new AsyncLock()
    private teamApiAuthLock = new AsyncLock()
    private lastKeepAliveSnapshot: SessionKeepAliveSnapshot
    private teamApiToken: string | null = null

    private emitSessionMessage(content: unknown): void {
        this.socket.emit('message', {
            sid: this.sessionId,
            message: content
        })
    }

    constructor(token: string, session: Session) {
        super()
        this.token = token
        this.sessionId = session.id
        this.teamContextSnapshot = session.teamContext
        this.metadata = session.metadata
        this.metadataVersion = session.metadataVersion
        this.agentState = session.agentState
        this.agentStateVersion = session.agentStateVersion
        this.lastKeepAliveSnapshot = createInitialKeepAliveSnapshot(session)

        this.rpcHandlerManager = new RpcHandlerManager({
            scopePrefix: this.sessionId,
            logger: (msg, data) => logger.debug(msg, data)
        })

        if (this.metadata?.path) {
            registerCommonHandlers(this.rpcHandlerManager, this.metadata.path)
        }

        this.socket = io(`${configuration.apiUrl}/cli`, {
            auth: {
                token: this.token,
                clientType: 'session-scoped' as const,
                sessionId: this.sessionId
            },
            path: '/socket.io/',
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            transports: ['websocket'],
            autoConnect: false
        })

        this.terminalManager = new TerminalManager({
            sessionId: this.sessionId,
            getSessionPath: () => this.metadata?.path ?? null,
            onReady: (payload) => this.socket.emit('terminal:ready', payload),
            onOutput: (payload) => this.socket.emit('terminal:output', payload),
            onExit: (payload) => this.socket.emit('terminal:exit', payload),
            onError: (payload) => this.socket.emit('terminal:error', payload)
        })

        this.socket.on('connect', () => {
            logger.debug('Socket connected successfully')
            this.rpcHandlerManager.onSocketConnect(this.socket)
            if (this.hasConnectedOnce) {
                this.needsBackfill = true
            }
            void this.backfillIfNeeded()
            this.hasConnectedOnce = true
            this.emitSessionAlive(this.lastKeepAliveSnapshot)
        })

        this.socket.on('rpc-request', async (data: { method: string; params: string }, callback: (response: string) => void) => {
            callback(await this.rpcHandlerManager.handleRequest(data))
        })

        this.socket.on('disconnect', (reason) => {
            logger.debug('[API] Socket disconnected:', reason)
            this.rpcHandlerManager.onSocketDisconnect()
            this.terminalManager.closeAll()
            if (this.hasConnectedOnce) {
                this.needsBackfill = true
            }
        })

        this.socket.on('connect_error', (error) => {
            logger.debug('[API] Socket connection error:', error)
            this.rpcHandlerManager.onSocketDisconnect()
        })

        this.socket.on('error', (payload) => {
            logger.debug('[API] Socket error:', payload)
        })

        const handleTerminalEvent = <T extends { sessionId: string }>(
            schema: ZodType<T>,
            handler: (payload: T) => void
        ) => (data: unknown) => {
            const parsed = schema.safeParse(data)
            if (!parsed.success) {
                return
            }
            if (parsed.data.sessionId !== this.sessionId) {
                return
            }
            handler(parsed.data)
        }

        this.socket.on('terminal:open', handleTerminalEvent(TerminalOpenPayloadSchema, (payload) => {
            this.terminalManager.create(payload.terminalId, payload.cols, payload.rows)
        }))

        this.socket.on('terminal:write', handleTerminalEvent(TerminalWritePayloadSchema, (payload) => {
            this.terminalManager.write(payload.terminalId, payload.data)
        }))

        this.socket.on('terminal:resize', handleTerminalEvent(TerminalResizePayloadSchema, (payload) => {
            this.terminalManager.resize(payload.terminalId, payload.cols, payload.rows)
        }))

        this.socket.on('terminal:close', handleTerminalEvent(TerminalClosePayloadSchema, (payload) => {
            this.terminalManager.close(payload.terminalId)
        }))

        this.socket.on('update', (data: Update) => {
            try {
                if (!data.body) return

                if (data.body.t === 'new-message') {
                    this.handleIncomingMessage(data.body.message)
                    return
                }

                if (data.body.t === 'update-session') {
                    if (data.body.metadata && data.body.metadata.version > this.metadataVersion) {
                        const parsed = MetadataSchema.safeParse(data.body.metadata.value)
                        if (parsed.success) {
                            this.metadata = parsed.data
                        } else {
                            logger.debug('[API] Ignoring invalid metadata update', { version: data.body.metadata.version })
                        }
                        this.metadataVersion = data.body.metadata.version
                    }
                    if (data.body.agentState && data.body.agentState.version > this.agentStateVersion) {
                        const next = data.body.agentState.value
                        if (next == null) {
                            this.agentState = null
                        } else {
                            const parsed = AgentStateSchema.safeParse(next)
                            if (parsed.success) {
                                this.agentState = parsed.data
                            } else {
                                logger.debug('[API] Ignoring invalid agentState update', { version: data.body.agentState.version })
                            }
                        }
                        this.agentStateVersion = data.body.agentState.version
                    }
                    return
                }

                this.emit('message', data.body)
            } catch (error) {
                logger.debug('[SOCKET] [UPDATE] [ERROR] Error handling update', { error })
            }
        })

        this.socket.connect()
    }

    get teamContext(): SessionTeamContext | undefined {
        return this.teamContextSnapshot
    }

    onUserMessage(callback: (data: UserMessage) => void): void {
        this.pendingMessageCallback = callback
        while (this.pendingMessages.length > 0) {
            this.deliverUserMessage(this.pendingMessages.shift()!, 'callback_flush')
        }
    }

    private emitDriverSwitchSendFailure(stage: DriverSwitchSendFailureStage, error: unknown): void {
        const code = resolveDriverSwitchSendFailureCode(error)
        logger.debug('[API] Driver switch send failed during user message delivery', { stage, code })

        try {
            this.sendSessionEvent({
                type: 'driver-switch-send-failed',
                stage,
                code
            })
        } catch (eventError) {
            logger.debug('[API] Failed to emit driver switch send failure event', {
                stage,
                code,
                error: eventError
            })
        }
    }

    private deliverUserMessage(message: UserMessage, stage: DriverSwitchSendFailureStage): void {
        const callback = this.pendingMessageCallback
        if (!callback) {
            this.pendingMessages.push(message)
            return
        }

        try {
            callback(message)
        } catch (error) {
            this.emitDriverSwitchSendFailure(stage, error)
        }
    }

    private enqueueUserMessage(message: UserMessage): void {
        if (this.pendingMessageCallback) {
            this.deliverUserMessage(message, 'socket_update')
        } else {
            this.pendingMessages.push(message)
        }
    }

    private createAuthorizedJsonRequestConfig(params?: Record<string, number>): AxiosRequestConfig {
        return {
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            params,
            timeout: API_SESSION_REQUEST_TIMEOUT_MS
        }
    }

    private getApiAuthUrl(): string {
        return `${configuration.apiUrl}/api/auth`
    }

    private getSessionRecoveryUrl(): string {
        return `${configuration.apiUrl}/cli/sessions/${encodeURIComponent(this.sessionId)}/recovery`
    }

    private getTeamProjectUrl(projectId: string): string {
        return `${configuration.apiUrl}/api/team-projects/${encodeURIComponent(projectId)}`
    }

    private getTeamProjectCloseUrl(projectId: string): string {
        return `${this.getTeamProjectUrl(projectId)}/close`
    }

    private getTeamProjectRolesUrl(projectId: string): string {
        return `${this.getTeamProjectUrl(projectId)}/roles`
    }

    private getTeamProjectRoleUrl(projectId: string, roleId: string): string {
        return `${this.getTeamProjectRolesUrl(projectId)}/${encodeURIComponent(roleId)}`
    }

    private getTeamMembersUrl(): string {
        return `${configuration.apiUrl}/api/team-members`
    }

    private getTeamMemberUrl(memberId: string): string {
        return `${this.getTeamMembersUrl()}/${encodeURIComponent(memberId)}`
    }

    private getTeamMemberMessageUrl(memberId: string): string {
        return `${this.getTeamMemberUrl(memberId)}/message`
    }

    private getTeamTasksUrl(): string {
        return `${configuration.apiUrl}/api/team-tasks`
    }

    private getTeamTaskUrl(taskId: string): string {
        return `${this.getTeamTasksUrl()}/${encodeURIComponent(taskId)}`
    }

    private getTeamTaskActionUrl(taskId: string, action: string): string {
        return `${this.getTeamTaskUrl(taskId)}/${action}`
    }

    private clearTeamApiToken(): void {
        this.teamApiToken = null
    }

    private isUnauthorizedApiError(error: unknown): boolean {
        return axios.isAxiosError(error) && error.response?.status === 401
    }

    private async getTeamApiToken(forceRefresh = false): Promise<string> {
        if (!forceRefresh && this.teamApiToken) {
            return this.teamApiToken
        }

        return await this.teamApiAuthLock.inLock(async () => {
            if (!forceRefresh && this.teamApiToken) {
                return this.teamApiToken
            }

            const response = await axios.post(
                this.getApiAuthUrl(),
                {
                    accessToken: this.token
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: API_SESSION_REQUEST_TIMEOUT_MS
                }
            )
            const parsed = ApiAuthResponseSchema.safeParse(response.data)
            if (!parsed.success) {
                throw apiValidationError('Invalid /api/auth response', response)
            }

            this.teamApiToken = parsed.data.token
            return parsed.data.token
        })
    }

    private async createTeamApiRequestConfig(): Promise<AxiosRequestConfig> {
        const token = await this.getTeamApiToken()
        return {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: API_SESSION_REQUEST_TIMEOUT_MS
        }
    }

    private async executeTeamApiRequest<T>(
        request: (config: AxiosRequestConfig) => Promise<AxiosResponse>,
        schema: ZodType<T>,
        validationErrorMessage: string
    ): Promise<T> {
        const run = async (): Promise<T> => {
            const response = await request(await this.createTeamApiRequestConfig())
            const parsed = schema.safeParse(response.data)
            if (!parsed.success) {
                throw apiValidationError(validationErrorMessage, response)
            }

            return parsed.data
        }

        try {
            return await run()
        } catch (error) {
            if (!this.isUnauthorizedApiError(error)) {
                throw error
            }

            this.clearTeamApiToken()
            const response = await request(await this.createTeamApiRequestConfig())
            const parsed = schema.safeParse(response.data)
            if (!parsed.success) {
                throw apiValidationError(validationErrorMessage, response)
            }

            return parsed.data
        }
    }

    private async getAuthorizedJson<T>(
        url: string,
        schema: ZodType<T>,
        validationErrorMessage: string
    ): Promise<T> {
        return await this.executeTeamApiRequest(
            async (config) => await axios.get(url, config),
            schema,
            validationErrorMessage
        )
    }

    private async postAuthorizedJson<T>(
        url: string,
        body: Record<string, unknown>,
        schema: ZodType<T>,
        validationErrorMessage: string
    ): Promise<T> {
        return await this.executeTeamApiRequest(
            async (config) => await axios.post(url, body, config),
            schema,
            validationErrorMessage
        )
    }

    private async patchAuthorizedJson<T>(
        url: string,
        body: Record<string, unknown>,
        schema: ZodType<T>,
        validationErrorMessage: string
    ): Promise<T> {
        return await this.executeTeamApiRequest(
            async (config) => await axios.patch(url, body, config),
            schema,
            validationErrorMessage
        )
    }

    private async deleteAuthorizedJson<T>(
        url: string,
        body: Record<string, unknown>,
        schema: ZodType<T>,
        validationErrorMessage: string
    ): Promise<T> {
        return await this.executeTeamApiRequest(
            async (config) => await axios.delete(url, {
                ...config,
                data: body
            }),
            schema,
            validationErrorMessage
        )
    }

    private async postTeamTaskAction(
        taskId: string,
        action: 'review-request' | 'review-result' | 'verification-request' | 'verification-result' | 'accept',
        body: Record<string, unknown>
    ): Promise<TeamTaskRecord> {
        const response = await this.postAuthorizedJson(
            this.getTeamTaskActionUrl(taskId, action),
            body,
            TeamTaskActionResponseSchema,
            `Invalid /api/team-tasks/:id/${action} response`
        )

        return response.task
    }

    private async postTeamMemberAction(
        url: string,
        body: Record<string, unknown>
    ) {
        return await this.postAuthorizedJson(
            url,
            body,
            TeamMemberActionResponseSchema,
            'Invalid team member action response'
        )
    }

    private async fetchSessionRecoveryPage(afterSeq: number): Promise<CliSessionRecoveryResponse> {
        const response = await axios.get(
            this.getSessionRecoveryUrl(),
            this.createAuthorizedJsonRequestConfig({
                afterSeq,
                limit: SESSION_RECOVERY_PAGE_SIZE
            })
        )

        const parsed = CliSessionRecoveryResponseSchema.safeParse(response.data)
        if (!parsed.success) {
            throw apiValidationError('Invalid /cli/sessions/:id/recovery response', response)
        }

        return parsed.data
    }

    private applyRecoveredMessages(messages: CliSessionRecoveryResponse['messages']): void {
        for (const message of messages) {
            this.handleIncomingMessage(message)
        }
    }

    private handleIncomingMessage(message: { seq?: number | null; content: unknown }): void {
        const seq = typeof message.seq === 'number' ? message.seq : null
        if (seq !== null) {
            if (this.lastSeenMessageSeq !== null && seq <= this.lastSeenMessageSeq) {
                return
            }
            this.lastSeenMessageSeq = seq
        }

        const userResult = UserMessageSchema.safeParse(message.content)
        if (userResult.success) {
            this.enqueueUserMessage(userResult.data)
            return
        }

        this.emit('message', message.content)
    }

    private async backfillIfNeeded(): Promise<void> {
        if (!this.needsBackfill) {
            return
        }
        try {
            await this.recoverSessionState()
            this.needsBackfill = false
        } catch (error) {
            logger.debug('[API] Backfill failed', error)
            this.needsBackfill = true
        }
    }

    private applyRecoveredSessionSnapshot(session: {
        metadata: unknown | null
        metadataVersion: number
        agentState: unknown | null
        agentStateVersion: number
        teamContext?: unknown
    }): void {
        const teamContextResult = SessionTeamContextSchema.optional().safeParse(session.teamContext)
        if (teamContextResult.success) {
            this.teamContextSnapshot = teamContextResult.data
        }

        if (session.metadataVersion > this.metadataVersion) {
            const metadataResult = MetadataSchema.safeParse(session.metadata)
            if (metadataResult.success) {
                this.metadata = metadataResult.data
            }
            this.metadataVersion = session.metadataVersion
        }

        if (session.agentStateVersion > this.agentStateVersion) {
            if (session.agentState == null) {
                this.agentState = null
            } else {
                const agentStateResult = AgentStateSchema.safeParse(session.agentState)
                if (agentStateResult.success) {
                    this.agentState = agentStateResult.data
                }
            }
            this.agentStateVersion = session.agentStateVersion
        }
    }

    getTeamContextSnapshot(): SessionTeamContext | undefined {
        return this.teamContextSnapshot
    }

    private async recoverSessionState(): Promise<void> {
        if (this.backfillInFlight) {
            await this.backfillInFlight
            return
        }

        const run = async () => {
            let cursor = this.lastSeenMessageSeq ?? 0
            while (true) {
                const recovery = await this.fetchSessionRecoveryPage(cursor)
                this.applyRecoveredSessionSnapshot(recovery.session)

                const messages = recovery.messages
                if (messages.length === 0) {
                    return
                }

                this.applyRecoveredMessages(messages)

                const nextCursor = findNextRecoveryCursor(messages, cursor)
                if (nextCursor <= cursor) {
                    logger.debug('[API] Backfill stopped due to non-advancing cursor', {
                        cursor,
                        nextCursor
                    })
                    return
                }

                cursor = nextCursor
                if (!recovery.page.hasMore) {
                    return
                }
            }
        }

        this.backfillInFlight = run().finally(() => {
            this.backfillInFlight = null
        })

        await this.backfillInFlight
    }

    sendClaudeSessionMessage(body: RawJSONLines): void {
        let content: MessageContent

        if (body.type === 'user' && typeof body.message.content === 'string' && body.isSidechain !== true && body.isMeta !== true) {
            content = {
                role: 'user',
                content: {
                    type: 'text',
                    text: body.message.content
                },
                meta: {
                    sentFrom: 'cli'
                }
            }
        } else {
            content = this.createOutputMessageContent(body)
        }

        this.emitSessionMessage(content)

        if (body.type === 'summary') {
            this.pendingAutoSummary = {
                text: body.summary,
                updatedAt: Date.now()
            }
        }
    }

    private createOutputMessageContent(body: unknown): MessageContent {
        return {
            role: 'agent',
            content: {
                type: 'output',
                data: body
            },
            meta: {
                sentFrom: 'cli'
            }
        }
    }

    sendOutputMessage(body: unknown): void {
        this.emitSessionMessage(this.createOutputMessageContent(body))
    }

    sendUserMessage(text: string, meta?: MessageMeta): void {
        if (!text) {
            return
        }

        const content: MessageContent = {
            role: 'user',
            content: {
                type: 'text',
                text
            },
            meta: {
                sentFrom: 'cli',
                ...(meta ?? {})
            }
        }

        this.emitSessionMessage(content)
    }

    getMetadataSnapshot(): Metadata | null {
        return this.metadata
    }

    async getTeamProject(projectId: string): Promise<TeamProjectSnapshot> {
        return await this.getAuthorizedJson(
            this.getTeamProjectUrl(projectId),
            TeamProjectSnapshotSchema,
            'Invalid /api/team-projects/:id response'
        )
    }

    async createTeamRole(
        projectId: string,
        input: {
            managerSessionId: string
            roleId: TeamProjectSnapshot['roles'][number]['id']
            prototype: TeamProjectSnapshot['roles'][number]['prototype']
            name: string
            promptExtension?: string | null
            providerFlavor?: TeamProjectSnapshot['roles'][number]['providerFlavor']
            model?: string | null
            reasoningEffort?: TeamProjectSnapshot['roles'][number]['reasoningEffort']
            isolationMode?: TeamProjectSnapshot['roles'][number]['isolationMode']
        }
    ): Promise<TeamProjectSnapshot['roles'][number]> {
        const response = await this.postAuthorizedJson(
            this.getTeamProjectRolesUrl(projectId),
            {
                ...input,
                promptExtension: input.promptExtension ?? undefined
            },
            TeamRoleActionResponseSchema,
            'Invalid /api/team-projects/:id/roles response'
        )

        return response.role
    }

    async updateTeamRole(
        projectId: string,
        roleId: string,
        input: {
            managerSessionId: string
            name?: string
            promptExtension?: string | null
            providerFlavor?: TeamProjectSnapshot['roles'][number]['providerFlavor']
            model?: string | null
            reasoningEffort?: TeamProjectSnapshot['roles'][number]['reasoningEffort']
            isolationMode?: TeamProjectSnapshot['roles'][number]['isolationMode']
        }
    ): Promise<TeamProjectSnapshot['roles'][number]> {
        const response = await this.patchAuthorizedJson(
            this.getTeamProjectRoleUrl(projectId, roleId),
            {
                managerSessionId: input.managerSessionId,
                name: input.name,
                promptExtension: input.promptExtension,
                providerFlavor: input.providerFlavor,
                model: input.model,
                reasoningEffort: input.reasoningEffort,
                isolationMode: input.isolationMode
            },
            TeamRoleActionResponseSchema,
            'Invalid /api/team-projects/:id/roles/:roleId response'
        )

        return response.role
    }

    async deleteTeamRole(
        projectId: string,
        roleId: string,
        input: {
            managerSessionId: string
        }
    ): Promise<string> {
        const response = await this.deleteAuthorizedJson(
            this.getTeamProjectRoleUrl(projectId, roleId),
            { managerSessionId: input.managerSessionId },
            TeamRoleDeleteResponseSchema,
            'Invalid /api/team-projects/:id/roles/:roleId delete response'
        )

        return response.roleId
    }

    async spawnTeamMember(input: {
        managerSessionId: string
        roleId: TeamProjectSnapshot['roles'][number]['id']
        providerFlavor?: TeamProjectSnapshot['roles'][number]['providerFlavor'] | null
        model?: string | null
        reasoningEffort?: Session['modelReasoningEffort'] | null
        isolationMode?: 'simple' | 'worktree'
        taskId?: string | null
        instruction?: string | null
        contextTrusted?: boolean
        workspaceTrusted?: boolean
        requireFreshPerspective?: boolean
        permissionMode?: SessionPermissionMode
        collaborationMode?: SessionCollaborationMode
        taskGoal?: string | null
        artifactSummary?: string | null
        attemptSummary?: string | null
        failureSummary?: string | null
        reviewSummary?: string | null
        filePointers?: string[]
    }) {
        return await this.postTeamMemberAction(this.getTeamMembersUrl(), {
            ...input,
            taskId: input.taskId ?? undefined,
            instruction: input.instruction ?? undefined,
            taskGoal: input.taskGoal ?? undefined,
            artifactSummary: input.artifactSummary ?? undefined,
            attemptSummary: input.attemptSummary ?? undefined,
            failureSummary: input.failureSummary ?? undefined,
            reviewSummary: input.reviewSummary ?? undefined
        })
    }

    async updateTeamMember(
        memberId: string,
        input:
            | {
                action: 'remove'
                managerSessionId: string
            }
            | {
                action: 'replace'
                managerSessionId: string
                providerFlavor?: TeamProjectSnapshot['roles'][number]['providerFlavor'] | null
                model?: string | null
                reasoningEffort?: Session['modelReasoningEffort'] | null
                isolationMode?: 'simple' | 'worktree'
                taskId?: string | null
                instruction?: string | null
                contextTrusted?: boolean
                workspaceTrusted?: boolean
                requireFreshPerspective?: boolean
                permissionMode?: SessionPermissionMode
                collaborationMode?: SessionCollaborationMode
                taskGoal?: string | null
                artifactSummary?: string | null
                attemptSummary?: string | null
                failureSummary?: string | null
                reviewSummary?: string | null
                filePointers?: string[]
            }
    ) {
        return await this.patchAuthorizedJson(
            this.getTeamMemberUrl(memberId),
            input,
            TeamMemberActionResponseSchema,
            'Invalid team member update response'
        )
    }

    async messageTeamMember(
        memberId: string,
        input: {
            managerSessionId: string
            text: string
            kind?: 'task-assign' | 'follow-up' | 'coordination'
        }
    ) {
        return await this.postTeamMemberAction(this.getTeamMemberMessageUrl(memberId), input)
    }

    async createTeamTask(input: {
        managerSessionId: string
        title: string
        description?: string | null
        acceptanceCriteria?: string | null
        parentTaskId?: string | null
        status?: 'todo' | 'running' | 'blocked' | 'canceled' | 'failed'
        assigneeMemberId?: string | null
        reviewerMemberId?: string | null
        verifierMemberId?: string | null
        priority?: string | null
        dependsOn?: string[]
        note?: string | null
    }): Promise<TeamTaskRecord> {
        const response = await this.postAuthorizedJson(
            this.getTeamTasksUrl(),
            input,
            TeamTaskActionResponseSchema,
            'Invalid /api/team-tasks response'
        )

        return response.task
    }

    async updateTeamTask(
        taskId: string,
        input: {
            managerSessionId: string
            title?: string
            description?: string | null
            acceptanceCriteria?: string | null
            status?: 'todo' | 'running' | 'blocked' | 'canceled' | 'failed'
            assigneeMemberId?: string | null
            reviewerMemberId?: string | null
            verifierMemberId?: string | null
            priority?: string | null
            dependsOn?: string[]
            note?: string | null
        }
    ): Promise<TeamTaskRecord> {
        const response = await this.patchAuthorizedJson(
            this.getTeamTaskUrl(taskId),
            input,
            TeamTaskActionResponseSchema,
            'Invalid /api/team-tasks/:id response'
        )

        return response.task
    }

    async closeTeamProject(
        projectId: string,
        input: {
            managerSessionId: string
            summary?: string | null
        }
    ) {
        const response = await this.postAuthorizedJson(
            this.getTeamProjectCloseUrl(projectId),
            {
                managerSessionId: input.managerSessionId,
                summary: input.summary ?? undefined
            },
            TeamProjectActionResponseSchema,
            'Invalid /api/team-projects/:id/close response'
        )

        return response.project
    }

    async requestTaskReview(
        taskId: string,
        input: {
            managerSessionId: string
            reviewerMemberId: string
            note?: string | null
        }
    ): Promise<TeamTaskRecord> {
        return await this.postTeamTaskAction(taskId, 'review-request', {
            managerSessionId: input.managerSessionId,
            reviewerMemberId: input.reviewerMemberId,
            note: input.note ?? undefined
        })
    }

    async submitTaskReviewResult(
        taskId: string,
        input: {
            memberId: string
            decision: 'accept' | 'request_changes'
            summary: string
        }
    ): Promise<TeamTaskRecord> {
        return await this.postTeamTaskAction(taskId, 'review-result', input)
    }

    async requestTaskVerification(
        taskId: string,
        input: {
            managerSessionId: string
            verifierMemberId: string
            note?: string | null
        }
    ): Promise<TeamTaskRecord> {
        return await this.postTeamTaskAction(taskId, 'verification-request', {
            managerSessionId: input.managerSessionId,
            verifierMemberId: input.verifierMemberId,
            note: input.note ?? undefined
        })
    }

    async submitTaskVerificationResult(
        taskId: string,
        input: {
            memberId: string
            decision: 'pass' | 'fail'
            summary: string
        }
    ): Promise<TeamTaskRecord> {
        return await this.postTeamTaskAction(taskId, 'verification-result', input)
    }

    async acceptTeamTask(
        taskId: string,
        input: {
            managerSessionId: string
            summary?: string | null
            skipVerificationReason?: string | null
        }
    ): Promise<TeamTaskRecord> {
        return await this.postTeamTaskAction(taskId, 'accept', {
            managerSessionId: input.managerSessionId,
            summary: input.summary ?? undefined,
            skipVerificationReason: input.skipVerificationReason ?? undefined
        })
    }

    sendCodexMessage(body: unknown): void {
        const content = {
            role: 'agent',
            content: {
                type: 'codex',
                data: body
            },
            meta: {
                sentFrom: 'cli'
            }
        }
        this.emitSessionMessage(content)
    }

    sendStreamUpdate(update: SessionStreamClientUpdate): void {
        this.socket.emit('stream-update', {
            sid: this.sessionId,
            ...update
        })
    }

    sendSessionEvent(event: {
        type: 'switch'
        mode: 'local' | 'remote'
    } | {
        type: 'message'
        message: string
    } | {
        type: 'permission-mode-changed'
        mode: SessionPermissionMode
    } | {
        type: 'driver-switch-send-failed'
        stage: DriverSwitchSendFailureStage
        code: DriverSwitchSendFailureCode
    } | {
        type: 'ready'
    }, id?: string): void {
        const content = {
            role: 'agent',
            content: {
                id: id ?? randomUUID(),
                type: 'event',
                data: event
            }
        }

        if (event.type === 'ready') {
            this.flushPendingAutoSummary()
        }

        this.emitSessionMessage(content)
    }

    keepAlive(
        thinking: boolean,
        mode: 'local' | 'remote',
        runtime?: SessionKeepAliveRuntime
    ): void {
        this.lastKeepAliveSnapshot = {
            thinking,
            mode,
            ...(runtime?.permissionMode !== undefined ? { permissionMode: runtime.permissionMode } : {}),
            ...(runtime?.model !== undefined ? { model: runtime.model } : {}),
            ...(runtime?.modelReasoningEffort !== undefined ? { modelReasoningEffort: runtime.modelReasoningEffort } : {}),
            ...(runtime?.collaborationMode !== undefined ? { collaborationMode: runtime.collaborationMode } : {})
        }
        this.emitSessionAlive(this.lastKeepAliveSnapshot, { volatile: true })
    }

    private emitSessionAlive(
        snapshot: SessionKeepAliveSnapshot,
        options?: { volatile?: boolean }
    ): void {
        const emitter = options?.volatile ? this.socket.volatile : this.socket
        emitter.emit('session-alive', toSessionAlivePayload(this.sessionId, snapshot))
    }

    sendSessionDeath(): void {
        this.flushPendingAutoSummary()
        void cleanupUploadDir(this.sessionId)
        this.socket.emit('session-end', { sid: this.sessionId, time: Date.now() })
    }

    async updateMetadataAndWait(
        handler: (metadata: WritableSessionMetadata) => WritableSessionMetadata,
        options?: MetadataUpdateOptions
    ): Promise<void> {
        await this.metadataLock.inLock(async () => {
            await backoff(async () => {
                const current = createWritableSessionMetadataSnapshot(this.metadata)
                const updated = stripLifecycleMetadataFields(handler(current))

                const answer = await this.socket.emitWithAck('update-metadata', {
                    sid: this.sessionId,
                    expectedVersion: this.metadataVersion,
                    metadata: updated,
                    touchUpdatedAt: options?.touchUpdatedAt
                }) as unknown

                applyVersionedAck(answer, {
                    valueKey: 'metadata',
                    parseValue: (value) => {
                        const parsed = MetadataSchema.safeParse(value)
                        return parsed.success ? parsed.data : null
                    },
                    applyValue: (value) => {
                        this.metadata = value
                    },
                    applyVersion: (version) => {
                        this.metadataVersion = version
                    },
                    logInvalidValue: (context, version) => {
                        const suffix = context === 'success' ? 'ack' : 'version-mismatch ack'
                        logger.debug(`[API] Ignoring invalid metadata value from ${suffix}`, { version })
                    },
                    invalidResponseMessage: 'Invalid update-metadata response',
                    errorMessage: 'Metadata update failed',
                    versionMismatchMessage: 'Metadata version mismatch'
                })
            })
        })
    }

    updateMetadata(
        handler: (metadata: WritableSessionMetadata) => WritableSessionMetadata,
        options?: MetadataUpdateOptions
    ): void {
        void this.updateMetadataAndWait(handler, options).catch((error) => {
            logger.debug('[API] Metadata update failed', error)
        })
    }

    updateAgentState(handler: (state: AgentState) => AgentState): void {
        this.agentStateLock.inLock(async () => {
            await backoff(async () => {
                const current = this.agentState ?? ({} as AgentState)
                const updated = handler(current)

                const answer = await this.socket.emitWithAck('update-state', {
                    sid: this.sessionId,
                    expectedVersion: this.agentStateVersion,
                    agentState: updated
                }) as unknown

                applyVersionedAck(answer, {
                    valueKey: 'agentState',
                    parseValue: (value) => {
                        const parsed = AgentStateSchema.safeParse(value)
                        return parsed.success ? parsed.data : null
                    },
                    applyValue: (value) => {
                        this.agentState = value
                    },
                    applyVersion: (version) => {
                        this.agentStateVersion = version
                    },
                    logInvalidValue: (context, version) => {
                        const suffix = context === 'success' ? 'ack' : 'version-mismatch ack'
                        logger.debug(`[API] Ignoring invalid agentState value from ${suffix}`, { version })
                    },
                    invalidResponseMessage: 'Invalid update-state response',
                    errorMessage: 'Agent state update failed',
                    versionMismatchMessage: 'Agent state version mismatch'
                })
            })
        })
    }

    async flushAgentStateUpdates(options?: { timeoutMs?: number }): Promise<void> {
        await this.drainLock(this.agentStateLock, options?.timeoutMs ?? SESSION_STATE_FLUSH_TIMEOUT_MS)
    }

    async flushKeepAliveSnapshot(options?: { timeoutMs?: number }): Promise<void> {
        const timeoutMs = options?.timeoutMs ?? SESSION_STATE_FLUSH_TIMEOUT_MS
        const connected = await this.waitForConnected(timeoutMs)
        if (!connected) {
            return
        }

        this.emitSessionAlive(this.lastKeepAliveSnapshot)
    }

    private flushPendingAutoSummary(): void {
        if (!this.pendingAutoSummary) {
            return
        }

        const summary = this.pendingAutoSummary
        this.pendingAutoSummary = null
        this.updateMetadata((metadata) => ({
            ...metadata,
            summary: {
                text: summary.text,
                updatedAt: summary.updatedAt
            }
        }), {
            touchUpdatedAt: false
        })
    }

    private async waitForConnected(timeoutMs: number): Promise<boolean> {
        if (this.socket.connected) {
            return true
        }

        this.socket.connect()

        return await new Promise<boolean>((resolve) => {
            let settled = false

            const cleanup = () => {
                this.socket.off('connect', onConnect)
                clearTimeout(timeout)
            }

            const onConnect = () => {
                if (settled) return
                settled = true
                cleanup()
                resolve(true)
            }

            const timeout = setTimeout(() => {
                if (settled) return
                settled = true
                cleanup()
                resolve(false)
            }, Math.max(0, timeoutMs))

            this.socket.on('connect', onConnect)
        })
    }

    private async drainLock(lock: AsyncLock, timeoutMs: number): Promise<boolean> {
        if (timeoutMs <= 0) {
            return false
        }

        return await new Promise<boolean>((resolve) => {
            let settled = false
            let timeout: ReturnType<typeof setTimeout> | null = null

            const finish = (value: boolean) => {
                if (settled) return
                settled = true
                if (timeout) {
                    clearTimeout(timeout)
                }
                resolve(value)
            }

            timeout = setTimeout(() => finish(false), timeoutMs)

            lock.inLock(async () => { })
                .then(() => finish(true))
                .catch(() => finish(false))
        })
    }

    async flush(options?: { timeoutMs?: number }): Promise<void> {
        const deadlineMs = Date.now() + (options?.timeoutMs ?? 5_000)

        const remainingMs = () => Math.max(0, deadlineMs - Date.now())

        await this.drainLock(this.metadataLock, remainingMs())
        await this.drainLock(this.agentStateLock, remainingMs())

        if (remainingMs() === 0) {
            return
        }

        const connected = await this.waitForConnected(remainingMs())
        if (!connected) {
            return
        }

        const pingTimeoutMs = remainingMs()
        if (pingTimeoutMs === 0) {
            return
        }

        try {
            await this.socket.timeout(pingTimeoutMs).emitWithAck('ping')
        } catch {
            // best effort
        }
    }

    close(): void {
        this.rpcHandlerManager.onSocketDisconnect()
        this.terminalManager.closeAll()
        this.socket.disconnect()
    }
}
