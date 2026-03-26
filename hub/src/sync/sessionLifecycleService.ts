import { getSessionLifecycleState, getSessionResumeToken } from '@viby/protocol'
import type { Session } from '@viby/protocol/types'
import { MachineCache } from './machineCache'
import { RpcGateway } from './rpcGateway'
import { SessionCache } from './sessionCache'

export type ResumeSessionResult =
    | { type: 'success'; sessionId: string }
    | { type: 'error'; message: string; code: 'session_not_found' | 'no_machine_online' | 'resume_unavailable' | 'resume_failed' | 'session_archived' }
type ResumeSessionError = Extract<ResumeSessionResult, { type: 'error' }>
type SessionSpawnOptions = Parameters<RpcGateway['spawnSession']>[0]
type SessionSpawnPreparation = {
    spawnOptions: SessionSpawnOptions
    resumeToken?: string
}

export type ResumeContractState = 'ready' | 'token_mismatch' | 'inactive_after_spawn' | 'timeout'
type ResumeContractFailureState = Exclude<ResumeContractState, 'ready'>

type ResumeSessionHooks = {
    cleanupFailedResumeSpawn: (
        originalSessionId: string,
        spawnedSessionId: string,
        resumeToken: string
    ) => Promise<string | null>
    waitForResumedSessionContract: (
        sessionId: string,
        resumeToken: string,
        timeoutMs?: number
    ) => Promise<ResumeContractState>
    writeSessionResumeToken: (sessionId: string, token: string | undefined) => Promise<void>
}

const SESSION_NOT_FOUND_ERROR = 'Session not found'
const ARCHIVED_BY_WEB = 'web'
const ARCHIVED_BY_USER_REASON = 'Archived by user'
const RESUME_CONTRACT_TIMEOUT_MS = 15_000
const RESUME_CONTRACT_POLL_INTERVAL_MS = 250

function withSessionResumeToken(
    metadata: Session['metadata'],
    token: string | undefined
): Session['metadata'] {
    if (!metadata) {
        return metadata
    }

    switch (metadata.flavor) {
        case 'codex':
            return { ...metadata, codexSessionId: token }
        case 'gemini':
            return { ...metadata, geminiSessionId: token }
        case 'opencode':
            return { ...metadata, opencodeSessionId: token }
        case 'cursor':
            return { ...metadata, cursorSessionId: token }
        case 'claude':
        case null:
        case undefined:
        default:
            return { ...metadata, claudeSessionId: token }
    }
}

function isMissingKillSessionHandler(error: unknown, sessionId: string): boolean {
    return error instanceof Error
        && error.message === `RPC handler not registered: ${sessionId}:killSession`
}

function assertSessionExists(session: Session | undefined): Session {
    if (!session) {
        throw new Error(SESSION_NOT_FOUND_ERROR)
    }

    return session
}

function getResumeContractFailureMessage(state: ResumeContractFailureState): string {
    switch (state) {
        case 'timeout':
            return 'Session resume timed out before the previous agent session reattached'
        case 'inactive_after_spawn':
            return 'Session exited before the previous agent session reattached'
        case 'token_mismatch':
            return 'Session failed to reattach to the previous agent session'
    }
}

function createResumeError(
    message: string,
    code: ResumeSessionError['code']
): ResumeSessionError {
    return {
        type: 'error',
        message,
        code
    }
}

function resolveSessionFlavor(metadata: Session['metadata']): NonNullable<SessionSpawnOptions['agent']> {
    return metadata?.flavor === 'codex'
        || metadata?.flavor === 'gemini'
        || metadata?.flavor === 'opencode'
        || metadata?.flavor === 'cursor'
        ? metadata.flavor
        : 'claude'
}

export class SessionLifecycleService {
    constructor(
        private readonly sessionCache: SessionCache,
        private readonly machineCache: MachineCache,
        private readonly rpcGateway: RpcGateway
    ) {
    }

    async closeSession(sessionId: string): Promise<Session> {
        const session = assertSessionExists(this.getSession(sessionId))

        if (getSessionLifecycleState(session) === 'archived' && !session.active) {
            return session
        }

        await this.stopSessionIfActive(sessionId, session.active)
        return await this.sessionCache.transitionSessionLifecycle(sessionId, 'closed', {
            markInactive: session.active
        })
    }

    async archiveSession(sessionId: string): Promise<Session> {
        const session = assertSessionExists(this.getSession(sessionId))

        if (getSessionLifecycleState(session) === 'archived' && !session.active) {
            return session
        }

        await this.stopSessionIfActive(sessionId, session.active)
        return await this.sessionCache.transitionSessionLifecycle(sessionId, 'archived', {
            markInactive: session.active,
            archivedBy: ARCHIVED_BY_WEB,
            archiveReason: ARCHIVED_BY_USER_REASON
        })
    }

    async unarchiveSession(sessionId: string): Promise<Session> {
        const session = assertSessionExists(this.getSession(sessionId))

        if (getSessionLifecycleState(session) !== 'archived') {
            return session
        }

        if (session.active) {
            throw new Error('Cannot unarchive active session')
        }

        return await this.sessionCache.transitionSessionLifecycle(sessionId, 'closed')
    }

    async resumeSession(
        sessionId: string,
        hooks?: Partial<ResumeSessionHooks>
    ): Promise<ResumeSessionResult> {
        const session = this.getSession(sessionId)
        if (!session) {
            return createResumeError('Session not found', 'session_not_found')
        }

        if (session.active) {
            return { type: 'success', sessionId }
        }

        const spawnPreparation = this.prepareSessionSpawn(session, {
            archivedMessage: 'Archived sessions must be restored before resuming',
            requireResumeToken: true
        })
        if ('type' in spawnPreparation) {
            return spawnPreparation
        }
        const { spawnOptions, resumeToken } = spawnPreparation
        if (!resumeToken) {
            return createResumeError('Resume session ID unavailable', 'resume_unavailable')
        }

        const resolvedHooks: ResumeSessionHooks = {
            cleanupFailedResumeSpawn: hooks?.cleanupFailedResumeSpawn
                ?? this.defaultCleanupFailedResumeSpawn.bind(this),
            waitForResumedSessionContract: hooks?.waitForResumedSessionContract
                ?? this.defaultWaitForResumedSessionContract.bind(this),
            writeSessionResumeToken: hooks?.writeSessionResumeToken
                ?? this.defaultWriteSessionResumeToken.bind(this)
        }

        try {
            await resolvedHooks.writeSessionResumeToken(sessionId, undefined)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to prepare session metadata for resume'
            return { type: 'error', message, code: 'resume_failed' }
        }

        const spawnResult = await this.rpcGateway.spawnSession(spawnOptions)

        if (spawnResult.type !== 'success') {
            const restoreError = await resolvedHooks.writeSessionResumeToken(sessionId, resumeToken)
                .then(() => null)
                .catch((error) => {
                    return error instanceof Error ? error.message : 'Failed to restore resume token after spawn failure'
                })
            if (restoreError) {
                return {
                    type: 'error',
                    message: `${spawnResult.message}. Cleanup also failed: ${restoreError}`,
                    code: 'resume_failed'
                }
            }
            return { type: 'error', message: spawnResult.message, code: 'resume_failed' }
        }

        if (spawnResult.sessionId !== sessionId) {
            const cleanupError = await resolvedHooks.cleanupFailedResumeSpawn(sessionId, spawnResult.sessionId, resumeToken)
            const baseMessage = 'Session failed to resume into the original hub session'
            const message = cleanupError
                ? `${baseMessage}. Cleanup also failed: ${cleanupError}`
                : baseMessage
            return { type: 'error', message, code: 'resume_failed' }
        }

        const contractState = await resolvedHooks.waitForResumedSessionContract(spawnResult.sessionId, resumeToken)
        if (contractState !== 'ready') {
            const cleanupError = await resolvedHooks.cleanupFailedResumeSpawn(sessionId, spawnResult.sessionId, resumeToken)
            const baseMessage = getResumeContractFailureMessage(contractState)
            const message = cleanupError
                ? `${baseMessage}. Cleanup also failed: ${cleanupError}`
                : baseMessage
            return { type: 'error', message, code: 'resume_failed' }
        }

        return { type: 'success', sessionId: spawnResult.sessionId }
    }

    async startSession(sessionId: string): Promise<ResumeSessionResult> {
        const session = this.getSession(sessionId)
        if (!session) {
            return createResumeError('Session not found', 'session_not_found')
        }

        if (session.active) {
            return { type: 'success', sessionId }
        }

        const spawnPreparation = this.prepareSessionSpawn(session, {
            archivedMessage: 'Archived sessions must be restored before starting',
            requireResumeToken: false
        })
        if ('type' in spawnPreparation) {
            return spawnPreparation
        }

        const spawnResult = await this.rpcGateway.spawnSession(spawnPreparation.spawnOptions)

        if (spawnResult.type !== 'success') {
            return { type: 'error', message: spawnResult.message, code: 'resume_failed' }
        }

        const startedSession = this.getSession(spawnResult.sessionId)
        if (!startedSession?.active) {
            return {
                type: 'error',
                message: 'Session remained inactive after start',
                code: 'resume_failed'
            }
        }

        return { type: 'success', sessionId: spawnResult.sessionId }
    }

    async defaultCleanupFailedResumeSpawn(
        originalSessionId: string,
        spawnedSessionId: string,
        resumeToken: string
    ): Promise<string | null> {
        const cleanupErrors: string[] = []

        try {
            await this.rpcGateway.killSession(spawnedSessionId)
        } catch (error) {
            if (!isMissingKillSessionHandler(error, spawnedSessionId)) {
                cleanupErrors.push(error instanceof Error ? error.message : 'Failed to kill spawned session')
            }
        }

        this.sessionCache.handleSessionEnd({ sid: spawnedSessionId, time: Date.now() })

        if (spawnedSessionId === originalSessionId) {
            try {
                await this.sessionCache.setSessionLifecycleState(spawnedSessionId, 'closed', {
                    touchUpdatedAt: false
                })
            } catch (error) {
                cleanupErrors.push(error instanceof Error ? error.message : 'Failed to close resumed session after cleanup')
            }
        } else {
            try {
                await this.sessionCache.deleteSession(spawnedSessionId)
            } catch (error) {
                cleanupErrors.push(error instanceof Error ? error.message : 'Failed to delete spawned session after cleanup')
            }
        }

        try {
            await this.defaultWriteSessionResumeToken(originalSessionId, resumeToken)
        } catch (error) {
            cleanupErrors.push(error instanceof Error ? error.message : 'Failed to restore resume token after cleanup')
        }

        return cleanupErrors.length > 0 ? cleanupErrors.join('; ') : null
    }

    async defaultWaitForResumedSessionContract(
        sessionId: string,
        resumeToken: string,
        timeoutMs: number = RESUME_CONTRACT_TIMEOUT_MS
    ): Promise<ResumeContractState> {
        let hasBecomeActive = false

        const resolveState = (): ResumeContractState | null => {
            const session = this.getSession(sessionId)
            const resumedToken = session ? getSessionResumeToken(session.metadata) : undefined

            if (session?.active) {
                hasBecomeActive = true
                if (resumedToken === resumeToken) {
                    return 'ready'
                }
                if (resumedToken && resumedToken !== resumeToken) {
                    return 'token_mismatch'
                }
            } else if (hasBecomeActive) {
                return 'inactive_after_spawn'
            }

            return null
        }

        const immediateState = resolveState()
        if (immediateState) {
            return immediateState
        }

        return await this.sessionCache.waitForSessionCondition(sessionId, {
            timeoutMs,
            resolveValue: () => resolveState(),
            onTimeout: () => 'timeout',
            isRelevantEvent: (event) =>
                event.type === 'session-added'
                || event.type === 'session-updated'
                || event.type === 'session-removed'
        })
    }

    async defaultWriteSessionResumeToken(sessionId: string, token: string | undefined): Promise<void> {
        await this.sessionCache.mutateSessionMetadata(sessionId, (currentMetadata) => {
            return withSessionResumeToken(currentMetadata, token) ?? currentMetadata
        }, {
            touchUpdatedAt: false
        })
    }

    private getSession(sessionId: string): Session | undefined {
        return this.sessionCache.getSession(sessionId) ?? this.sessionCache.refreshSession(sessionId) ?? undefined
    }

    private async stopSessionIfActive(sessionId: string, active: boolean): Promise<void> {
        if (!active) {
            return
        }

        await this.rpcGateway.killSession(sessionId)
    }

    private prepareSessionSpawn(
        session: Session,
        options: {
            archivedMessage: string
            requireResumeToken: boolean
        }
    ): SessionSpawnPreparation | ResumeSessionError {
        if (getSessionLifecycleState(session) === 'archived') {
            return createResumeError(options.archivedMessage, 'session_archived')
        }

        const metadata = session.metadata
        if (!metadata || typeof metadata.path !== 'string') {
            return createResumeError('Session metadata missing path', 'resume_unavailable')
        }

        const targetMachine = this.resolveResumeTargetMachine(session)
        if (!targetMachine) {
            return createResumeError('No machine online', 'no_machine_online')
        }

        const resumeToken = options.requireResumeToken
            ? getSessionResumeToken(session.metadata)
            : undefined
        if (options.requireResumeToken && !resumeToken) {
            return createResumeError('Resume session ID unavailable', 'resume_unavailable')
        }

        return {
            resumeToken,
            spawnOptions: this.buildSessionSpawnOptions(
                session,
                targetMachine.id,
                metadata.path,
                resumeToken
            )
        }
    }

    private buildSessionSpawnOptions(
        session: Session,
        machineId: string,
        directory: string,
        resumeSessionId?: string
    ): SessionSpawnOptions {
        return {
            sessionId: session.id,
            machineId,
            directory,
            agent: resolveSessionFlavor(session.metadata),
            model: session.model ?? undefined,
            modelReasoningEffort: session.modelReasoningEffort ?? undefined,
            permissionMode: session.permissionMode,
            resumeSessionId,
            collaborationMode: session.collaborationMode
        }
    }

    private resolveResumeTargetMachine(session: Session) {
        const metadata = session.metadata
        if (!metadata) {
            return null
        }

        const onlineMachines = this.machineCache.getOnlineMachines()
        if (onlineMachines.length === 0) {
            return null
        }

        if (metadata.machineId) {
            const exactMatch = onlineMachines.find((machine) => machine.id === metadata.machineId)
            if (exactMatch) {
                return exactMatch
            }
        }

        if (metadata.host) {
            const hostMatch = onlineMachines.find((machine) => machine.metadata?.host === metadata.host)
            if (hostMatch) {
                return hostMatch
            }
        }

        return null
    }
}
