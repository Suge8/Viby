import {
    getSessionLifecycleState,
    getSessionResumeToken,
    resolveSessionDriver,
    type SessionDriver,
    supportsHandlelessSessionResume,
    supportsSessionContinuityResume,
} from '@viby/protocol'
import type { Session } from '@viby/protocol/types'
import { MachineCache } from './machineCache'
import { RpcGateway } from './rpcGateway'
import { SessionCache } from './sessionCache'
import {
    type DriverSwitchErrorCode,
    type DriverSwitchResult,
    type DriverSwitchRollbackResult,
    type DriverSwitchStage,
    SessionDriverSwitchService,
} from './sessionDriverSwitchService'
import {
    ARCHIVED_BY_USER_REASON,
    ARCHIVED_BY_WEB,
    assertSessionExists,
    type DriverSwitchHooks,
    getResumeContractFailureMessage,
    type ResumeSessionHooks,
    resolveResumeSessionHooks,
    type SessionSpawnOptions,
} from './sessionLifecycleSupport'
import { type ResumeContractState, SessionSpawnSupport } from './sessionSpawnSupport'

export type {
    DriverSwitchErrorCode,
    DriverSwitchResult,
    DriverSwitchRollbackResult,
    DriverSwitchStage,
} from './sessionDriverSwitchService'
export type { ResumeContractState } from './sessionSpawnSupport'

export type ResumeSessionResult =
    | { type: 'success'; sessionId: string }
    | {
          type: 'error'
          message: string
          code: 'session_not_found' | 'no_machine_online' | 'resume_unavailable' | 'resume_failed' | 'session_archived'
      }
type ResumeSessionError = Extract<ResumeSessionResult, { type: 'error' }>
const DEFAULT_SESSION_DRIVER: SessionDriver = 'claude'

function createResumeError(message: string, code: ResumeSessionError['code']): ResumeSessionError {
    return { type: 'error', message, code }
}

export class SessionLifecycleService {
    private readonly sessionSpawnSupport: SessionSpawnSupport
    private readonly sessionDriverSwitchService: SessionDriverSwitchService

    constructor(
        private readonly sessionCache: SessionCache,
        machineCache: MachineCache,
        private readonly rpcGateway: RpcGateway
    ) {
        this.sessionSpawnSupport = new SessionSpawnSupport(sessionCache, machineCache, rpcGateway)
        this.sessionDriverSwitchService = new SessionDriverSwitchService(
            sessionCache,
            rpcGateway,
            this.sessionSpawnSupport,
            (sessionId) => this.getSession(sessionId)
        )
    }

    async closeSession(sessionId: string): Promise<Session> {
        const session = assertSessionExists(this.getSession(sessionId))

        if (getSessionLifecycleState(session) === 'archived' && !session.active) {
            return session
        }

        await this.stopSessionIfActive(sessionId, session.active)
        return await this.sessionCache.transitionSessionLifecycle(sessionId, 'closed', {
            markInactive: session.active,
        })
    }

    async archiveSession(
        sessionId: string,
        options?: {
            archivedBy?: string
            archiveReason?: string
        }
    ): Promise<Session> {
        const session = assertSessionExists(this.getSession(sessionId))

        if (getSessionLifecycleState(session) === 'archived' && !session.active) {
            return session
        }

        await this.stopSessionIfActive(sessionId, session.active)
        return await this.sessionCache.transitionSessionLifecycle(sessionId, 'archived', {
            markInactive: session.active,
            archivedBy: options?.archivedBy ?? ARCHIVED_BY_WEB,
            archiveReason: options?.archiveReason ?? ARCHIVED_BY_USER_REASON,
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

    async resumeSession(sessionId: string, hooks?: Partial<ResumeSessionHooks>): Promise<ResumeSessionResult> {
        const session = this.getSession(sessionId)
        if (!session) {
            return createResumeError('Session not found', 'session_not_found')
        }

        if (session.active) {
            return { type: 'success', sessionId }
        }

        const spawnPreparation = this.sessionSpawnSupport.prepareSessionSpawn(session, {
            archivedMessage: 'Archived sessions must be restored before resuming',
            includeResumeToken: true,
        })
        if (spawnPreparation.type === 'error') {
            return createResumeError(spawnPreparation.message, spawnPreparation.code)
        }
        const { spawnOptions, resumeToken } = spawnPreparation
        if (supportsHandlelessSessionResume(session.metadata)) {
            return await this.spawnInactiveSession(spawnOptions)
        }

        const resolvedHooks = this.resolveResumeSessionHooks(hooks)
        const resolvedDriver = resolveSessionDriver(session.metadata) ?? DEFAULT_SESSION_DRIVER

        if (!resumeToken) {
            if (!supportsSessionContinuityResume(session.metadata)) {
                return createResumeError('Resume session ID unavailable', 'resume_unavailable')
            }

            const handoffSnapshot = this.sessionSpawnSupport.buildResumeContinuityHandoff(
                sessionId,
                resolvedHooks.buildSessionHandoff
            )
            if (typeof handoffSnapshot === 'string') {
                return createResumeError(handoffSnapshot, 'resume_failed')
            }

            return await this.spawnInactiveSession({
                ...spawnOptions,
                driverSwitch: {
                    targetDriver: resolvedDriver,
                    handoffSnapshot,
                },
            })
        }

        try {
            await resolvedHooks.writeSessionResumeToken(sessionId, undefined)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to prepare session metadata for resume'
            return createResumeError(message, 'resume_failed')
        }

        const spawnResult = await this.rpcGateway.spawnSession(spawnOptions)

        if (spawnResult.type !== 'success') {
            const restoreError = await resolvedHooks
                .writeSessionResumeToken(sessionId, resumeToken)
                .then(() => null)
                .catch((error) => {
                    return error instanceof Error ? error.message : 'Failed to restore resume token after spawn failure'
                })
            if (restoreError) {
                return createResumeError(
                    `${spawnResult.message}. Cleanup also failed: ${restoreError}`,
                    'resume_failed'
                )
            }
            return createResumeError(spawnResult.message, 'resume_failed')
        }

        if (spawnResult.sessionId !== sessionId) {
            const cleanupError = await resolvedHooks.cleanupFailedResumeSpawn(
                sessionId,
                spawnResult.sessionId,
                resumeToken
            )
            const baseMessage = 'Session failed to resume into the original hub session'
            const message = cleanupError ? `${baseMessage}. Cleanup also failed: ${cleanupError}` : baseMessage
            return { type: 'error', message, code: 'resume_failed' }
        }

        const contractState = await resolvedHooks.waitForResumedSessionContract(spawnResult.sessionId, resumeToken)
        if (contractState !== 'ready') {
            const cleanupError = await resolvedHooks.cleanupFailedResumeSpawn(
                sessionId,
                spawnResult.sessionId,
                resumeToken
            )
            const baseMessage = getResumeContractFailureMessage(contractState)
            const message = cleanupError ? `${baseMessage}. Cleanup also failed: ${cleanupError}` : baseMessage
            return { type: 'error', message, code: 'resume_failed' }
        }

        const normalizedSession = await this.sessionCache.transitionSessionLifecycle(spawnResult.sessionId, 'running', {
            touchUpdatedAt: false,
        })

        return { type: 'success', sessionId: normalizedSession.id }
    }

    async startSession(sessionId: string): Promise<ResumeSessionResult> {
        const session = this.getSession(sessionId)
        if (!session) {
            return createResumeError('Session not found', 'session_not_found')
        }

        if (session.active) {
            return { type: 'success', sessionId }
        }

        const spawnPreparation = this.sessionSpawnSupport.prepareSessionSpawn(session, {
            archivedMessage: 'Archived sessions must be restored before starting',
            includeResumeToken: false,
        })
        if (spawnPreparation.type === 'error') {
            return createResumeError(spawnPreparation.message, spawnPreparation.code)
        }
        return await this.spawnInactiveSession(spawnPreparation.spawnOptions)
    }

    async switchSessionDriver(
        sessionId: string,
        targetDriver: SessionDriver,
        hooks: DriverSwitchHooks
    ): Promise<DriverSwitchResult> {
        return await this.sessionDriverSwitchService.switchSessionDriver(sessionId, targetDriver, hooks)
    }

    async defaultCleanupFailedResumeSpawn(
        originalSessionId: string,
        spawnedSessionId: string,
        resumeToken: string
    ): Promise<string | null> {
        return await this.sessionSpawnSupport.defaultCleanupFailedResumeSpawn(
            originalSessionId,
            spawnedSessionId,
            resumeToken
        )
    }

    async defaultWaitForResumedSessionContract(
        sessionId: string,
        resumeToken: string,
        timeoutMs?: number
    ): Promise<ResumeContractState> {
        return await this.sessionSpawnSupport.defaultWaitForResumedSessionContract(sessionId, resumeToken, timeoutMs)
    }

    async defaultWriteSessionResumeToken(sessionId: string, token: string | undefined): Promise<void> {
        await this.sessionSpawnSupport.defaultWriteSessionResumeToken(sessionId, token)
    }

    private resolveResumeSessionHooks(hooks?: Partial<ResumeSessionHooks>): ResumeSessionHooks {
        return resolveResumeSessionHooks(hooks, {
            cleanupFailedResumeSpawn: this.defaultCleanupFailedResumeSpawn.bind(this),
            waitForResumedSessionContract: this.defaultWaitForResumedSessionContract.bind(this),
            writeSessionResumeToken: this.defaultWriteSessionResumeToken.bind(this),
        })
    }

    private getSession(sessionId: string): Session | undefined {
        return this.sessionCache.getSession(sessionId) ?? this.sessionCache.refreshSession(sessionId) ?? undefined
    }

    private async stopSessionIfActive(sessionId: string, active: boolean): Promise<void> {
        if (active) {
            await this.rpcGateway.killSession(sessionId)
        }
    }

    private async spawnInactiveSession(spawnOptions: SessionSpawnOptions): Promise<ResumeSessionResult> {
        const spawnResult = await this.sessionSpawnSupport.spawnInactiveSession(spawnOptions)
        if (spawnResult.type === 'error') {
            return createResumeError(spawnResult.message, 'resume_failed')
        }
        return spawnResult
    }
}
