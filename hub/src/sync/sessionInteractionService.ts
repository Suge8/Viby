import {
    extractLeadingCommandTrigger,
    getSessionLifecycleState,
    isLifecycleOwnedCommandEffect,
    resolveCommandSessionEffect,
    resolveSessionDriver,
    shouldInvalidateCommandCapabilitiesOnTrigger,
} from '@viby/protocol'
import type { Session } from '@viby/protocol/types'
import type { RpcDeleteUploadResponse, RpcUploadFileResponse } from './rpcGateway'
import type { ResumeSessionResult } from './sessionLifecycleService'
import type {
    InternalSessionMessagePayload,
    SessionConfigPatch,
    SessionSendMessagePayload,
} from './sessionPayloadTypes'

export type SessionSendMessageErrorCode =
    | Extract<ResumeSessionResult, { type: 'error' }>['code']
    | 'command_requires_lifecycle_owner'
    | 'command_use_new_session'
    | 'session_not_found'

const NEW_SESSION_LIFECYCLE_COMMANDS = new Set(['/new', '/clear'])
const RESUME_LIFECYCLE_COMMANDS = new Set(['/resume', '/chat resume'])
const NEW_SESSION_LIFECYCLE_MESSAGE = 'This command is managed by Viby. Use New Session instead.'
const RESUME_LIFECYCLE_MESSAGE =
    'This command is managed by Viby. Open History for Hub-managed chats, or use New Session → Recover Local for local sessions Viby has not imported yet.'
const GENERIC_LIFECYCLE_MESSAGE = 'This command changes session history and must stay behind the Viby lifecycle owner.'

type SessionInteractionServiceOptions = {
    getSession: (sessionId: string) => Session | undefined
    hasMessages: (sessionId: string) => boolean
    startSession: (sessionId: string) => Promise<ResumeSessionResult>
    resumeSession: (sessionId: string) => Promise<ResumeSessionResult>
    unarchiveSession: (sessionId: string) => Promise<Session>
    appendUserMessage: (sessionId: string, payload: InternalSessionMessagePayload) => Promise<void>
    refreshSession: (sessionId: string) => Session | null
    uploadFile: (
        machineId: string,
        sessionId: string,
        filename: string,
        content: string,
        mimeType: string
    ) => Promise<RpcUploadFileResponse>
    deleteUploadFile: (machineId: string, sessionId: string, path: string) => Promise<RpcDeleteUploadResponse>
    onCommandCapabilitiesInvalidated: (sessionId: string) => void
    createSendError: (message: string, code: SessionSendMessageErrorCode, status: 404 | 409) => Error
}

export class SessionInteractionService {
    constructor(private readonly options: SessionInteractionServiceOptions) {}

    async sendMessage(sessionId: string, payload: SessionSendMessagePayload): Promise<Session> {
        const readySession = this.options.getSession(sessionId)
        this.throwIfLifecycleOwnedCommand(sessionId, payload.text)
        const nextSession = await this.appendInternalUserMessage(sessionId, {
            text: payload.text,
            localId: payload.localId,
            attachments: payload.attachments,
            meta: {
                sentFrom: payload.sentFrom ?? 'webapp',
            },
        })
        this.emitCommandCapabilityInvalidationForTrigger(readySession, payload.text, sessionId)
        return nextSession
    }

    async appendInternalUserMessage(sessionId: string, payload: InternalSessionMessagePayload): Promise<Session> {
        const readySession = await this.ensureSessionReadyForSend(sessionId)
        await this.options.appendUserMessage(sessionId, payload)
        this.options.refreshSession(sessionId)
        return this.options.getSession(sessionId) ?? readySession
    }

    async appendPassiveInternalUserMessage(
        sessionId: string,
        payload: InternalSessionMessagePayload
    ): Promise<Session> {
        const readySession = await this.ensurePassiveInternalUserMessageTarget(sessionId)
        await this.options.appendUserMessage(sessionId, payload)
        this.options.refreshSession(sessionId)
        return this.options.getSession(sessionId) ?? readySession
    }

    async ensurePassiveInternalUserMessageTarget(sessionId: string): Promise<Session> {
        const existingSession = this.options.getSession(sessionId)
        if (!existingSession) {
            throw this.options.createSendError('Session not found', 'session_not_found', 404)
        }
        if (existingSession.active) {
            return existingSession
        }

        return await this.ensureSessionReadyForSend(sessionId)
    }

    async uploadFile(
        sessionId: string,
        filename: string,
        content: string,
        mimeType: string
    ): Promise<RpcUploadFileResponse> {
        const target = this.resolveAttachmentMutationTarget(sessionId)
        return await this.options.uploadFile(target.machineId, sessionId, filename, content, mimeType)
    }

    async deleteUploadFile(sessionId: string, path: string): Promise<RpcDeleteUploadResponse> {
        const target = this.resolveAttachmentMutationTarget(sessionId)
        return await this.options.deleteUploadFile(target.machineId, sessionId, path)
    }

    private async ensureSessionReadyForSend(sessionId: string): Promise<Session> {
        const session = this.options.getSession(sessionId)
        if (!session) {
            throw this.options.createSendError('Session not found', 'session_not_found', 404)
        }
        if (session.active) {
            return session
        }

        const shouldFreshStart = !this.options.hasMessages(sessionId)
        if (getSessionLifecycleState(session) === 'archived') {
            await this.options.unarchiveSession(sessionId)
        }

        const resumeResult = shouldFreshStart
            ? await this.options.startSession(sessionId)
            : await this.options.resumeSession(sessionId)
        if (resumeResult.type !== 'success') {
            throw this.options.createSendError(
                resumeResult.message,
                resumeResult.code,
                resumeResult.code === 'session_not_found' ? 404 : 409
            )
        }

        const resumedSession = this.options.getSession(resumeResult.sessionId)
        if (!resumedSession) {
            throw this.options.createSendError('Session not found', 'session_not_found', 404)
        }
        if (!resumedSession.active) {
            throw this.options.createSendError('Session remained inactive after resume', 'resume_failed', 409)
        }

        return resumedSession
    }

    private resolveAttachmentMutationTarget(sessionId: string): { machineId: string } {
        const session = this.options.getSession(sessionId)
        if (!session) {
            throw this.options.createSendError('Session not found', 'session_not_found', 404)
        }
        const machineId = session.metadata?.machineId?.trim()
        if (!machineId) {
            throw this.options.createSendError('Local runtime unavailable', 'no_machine_online', 409)
        }

        return { machineId }
    }

    private throwIfLifecycleOwnedCommand(sessionId: string, text: string): void {
        const session = this.options.getSession(sessionId)
        if (!session) {
            return
        }

        const trigger = extractLeadingCommandTrigger(text)
        if (!trigger) {
            return
        }

        const sessionEffect = resolveCommandSessionEffect(resolveSessionDriver(session.metadata), trigger)
        if (!isLifecycleOwnedCommandEffect(sessionEffect)) {
            return
        }

        if (NEW_SESSION_LIFECYCLE_COMMANDS.has(trigger)) {
            throw this.options.createSendError(NEW_SESSION_LIFECYCLE_MESSAGE, 'command_use_new_session', 409)
        }

        if (RESUME_LIFECYCLE_COMMANDS.has(trigger)) {
            throw this.options.createSendError(RESUME_LIFECYCLE_MESSAGE, 'command_requires_lifecycle_owner', 409)
        }

        throw this.options.createSendError(GENERIC_LIFECYCLE_MESSAGE, 'command_requires_lifecycle_owner', 409)
    }

    private emitCommandCapabilityInvalidationForTrigger(
        session: Session | undefined,
        text: string,
        sessionId: string
    ): void {
        if (!session) {
            return
        }

        const trigger = extractLeadingCommandTrigger(text)
        if (!trigger) {
            return
        }

        if (!shouldInvalidateCommandCapabilitiesOnTrigger(resolveSessionDriver(session.metadata), trigger)) {
            return
        }

        this.options.onCommandCapabilitiesInvalidated(sessionId)
    }
}
