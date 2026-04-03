import {
    getSessionLifecycleState,
    getSessionResumeToken,
    resolveSessionDriver,
    setSessionDriverRuntimeHandle,
    type SessionDriver,
    type SessionHandoffSnapshot,
} from '@viby/protocol'
import type { Session } from '@viby/protocol/types'
import { MachineCache } from './machineCache'
import { RpcGateway } from './rpcGateway'
import { SessionCache } from './sessionCache'
import { normalizeDriverSwitchSpawnConfig } from './sessionSwitchConfig'

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

export type DriverSwitchStage = 'idle_gate' | 'handoff_build' | 'stop' | 'spawn' | 'attach' | 'marker_append'
export type DriverSwitchErrorCode =
    | 'session_not_found'
    | 'unsupported_target_driver'
    | 'session_not_idle'
    | 'handoff_build_failed'
    | 'stop_failed'
    | 'stop_timeout'
    | 'spawn_failed'
    | 'spawn_session_mismatch'
    | 'attach_timeout'
    | 'attach_failed'
    | 'marker_append_failed'
export type DriverSwitchRollbackResult = 'not_started' | 'not_needed' | 'session_metadata_restored' | 'session_metadata_restore_failed'
export type DriverSwitchResult =
    | { type: 'success'; session: Session; targetDriver: SessionDriver }
    | {
        type: 'error'
        message: string
        code: DriverSwitchErrorCode
        stage: DriverSwitchStage
        status: 404 | 409 | 500
        targetDriver: SessionDriver
        rollbackResult: DriverSwitchRollbackResult
        session: Session | null
    }

type DriverSwitchHooks = {
    buildSessionHandoff: (sessionId: string) => SessionHandoffSnapshot
}

type DriverSwitchValidation = {
    session: Session
    previousDriver: SessionDriver | null
}

type DriverSwitchSpawnContext = DriverSwitchValidation & {
    handoffSnapshot: SessionHandoffSnapshot
}

type DriverSwitchAttachState = 'attached' | 'timeout'

const SESSION_NOT_FOUND_ERROR = 'Session not found'
const ARCHIVED_BY_WEB = 'web'
const ARCHIVED_BY_USER_REASON = 'Archived by user'
const DEFAULT_SESSION_DRIVER: SessionDriver = 'claude'
const RESUME_CONTRACT_TIMEOUT_MS = 15_000
const DRIVER_SWITCH_CONTRACT_TIMEOUT_MS = 15_000
const SUPPORTED_DRIVER_SWITCH_TARGETS = new Set<SessionDriver>(['claude', 'codex'])

function withSessionResumeToken(
    metadata: Session['metadata'],
    token: string | undefined
): Session['metadata'] {
    if (!metadata) {
        return metadata
    }

    const driver = resolveSessionDriver(metadata) ?? DEFAULT_SESSION_DRIVER
    return setSessionDriverRuntimeHandle(
        metadata,
        driver,
        token ? { sessionId: token } : undefined
    ) as Session['metadata']
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

function getDriverSwitchStatus(code: DriverSwitchErrorCode): 404 | 409 | 500 {
    switch (code) {
        case 'session_not_found':
            return 404
        case 'unsupported_target_driver':
        case 'session_not_idle':
            return 409
        default:
            return 500
    }
}

function createDriverSwitchError(
    message: string,
    options: {
        code: DriverSwitchErrorCode
        stage: DriverSwitchStage
        targetDriver: SessionDriver
        rollbackResult?: DriverSwitchRollbackResult
        session?: Session | null
    }
): Extract<DriverSwitchResult, { type: 'error' }> {
    return {
        type: 'error',
        message,
        code: options.code,
        stage: options.stage,
        status: getDriverSwitchStatus(options.code),
        targetDriver: options.targetDriver,
        rollbackResult: options.rollbackResult ?? 'not_started',
        session: options.session ?? null
    }
}

function resolveSessionSpawnDriver(metadata: Session['metadata']): NonNullable<SessionSpawnOptions['agent']> {
    return resolveSessionDriver(metadata) ?? DEFAULT_SESSION_DRIVER
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
            archiveReason: options?.archiveReason ?? ARCHIVED_BY_USER_REASON
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

    async switchSessionDriver(
        sessionId: string,
        targetDriver: SessionDriver,
        hooks: DriverSwitchHooks
    ): Promise<DriverSwitchResult> {
        const validation = this.validateDriverSwitchRequest(sessionId, targetDriver)
        if ('type' in validation) {
            return validation
        }

        const handoffResult = this.buildDriverSwitchHandoff(sessionId, targetDriver, validation.session, hooks)
        if ('type' in handoffResult) {
            return handoffResult
        }

        const stopError = await this.stopDriverSwitchSourceSession(validation.session, targetDriver)
        if (stopError) {
            return stopError
        }

        const spawnError = await this.spawnDriverSwitchTargetSession({
            ...validation,
            handoffSnapshot: handoffResult
        }, targetDriver)
        if (spawnError) {
            return spawnError
        }

        return await this.finalizeDriverSwitch(validation, targetDriver)
    }

    private validateDriverSwitchRequest(
        sessionId: string,
        targetDriver: SessionDriver
    ): DriverSwitchValidation | Extract<DriverSwitchResult, { type: 'error' }> {
        const session = this.getSession(sessionId)
        if (!session) {
            return createDriverSwitchError('Session not found', {
                code: 'session_not_found',
                stage: 'idle_gate',
                targetDriver
            })
        }
        if (!SUPPORTED_DRIVER_SWITCH_TARGETS.has(targetDriver)) {
            return createDriverSwitchError('Unsupported target driver', {
                code: 'unsupported_target_driver',
                stage: 'idle_gate',
                targetDriver,
                session
            })
        }
        if (!session.active || session.thinking) {
            return createDriverSwitchError('Driver switching requires an idle active session', {
                code: 'session_not_idle',
                stage: 'idle_gate',
                targetDriver,
                session
            })
        }

        return {
            session,
            previousDriver: resolveSessionDriver(session.metadata)
        }
    }

    private buildDriverSwitchHandoff(
        sessionId: string,
        targetDriver: SessionDriver,
        session: Session,
        hooks: DriverSwitchHooks
    ): SessionHandoffSnapshot | Extract<DriverSwitchResult, { type: 'error' }> {
        try {
            return hooks.buildSessionHandoff(sessionId)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to build session handoff'
            return createDriverSwitchError(message, {
                code: 'handoff_build_failed',
                stage: 'handoff_build',
                targetDriver,
                session
            })
        }
    }

    private async stopDriverSwitchSourceSession(
        session: Session,
        targetDriver: SessionDriver
    ): Promise<Extract<DriverSwitchResult, { type: 'error' }> | null> {
        try {
            await this.rpcGateway.killSession(session.id)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to stop session before driver switch'
            return createDriverSwitchError(message, {
                code: 'stop_failed',
                stage: 'stop',
                targetDriver,
                session: this.getSession(session.id) ?? session
            })
        }

        const stopState = await this.waitForDriverSwitchStop(session.id)
        if (stopState === 'stopped') {
            return null
        }

        return createDriverSwitchError('Session stop timed out before driver switch spawn', {
            code: 'stop_timeout',
            stage: 'stop',
            targetDriver,
            session: this.getSession(session.id) ?? session
        })
    }

    private async spawnDriverSwitchTargetSession(
        context: DriverSwitchSpawnContext,
        targetDriver: SessionDriver
    ): Promise<Extract<DriverSwitchResult, { type: 'error' }> | null> {
        const targetMachine = this.resolveResumeTargetMachine(context.session)
        if (!targetMachine) {
            return createDriverSwitchError('No machine online', {
                code: 'spawn_failed',
                stage: 'spawn',
                targetDriver,
                session: this.getSession(context.session.id) ?? context.session,
                rollbackResult: 'not_needed'
            })
        }

        const normalizedSwitchConfig = normalizeDriverSwitchSpawnConfig(context.session, targetDriver)
        const spawnResult = await this.rpcGateway.spawnSession({
            ...this.buildSessionSpawnOptions(context.session, targetMachine.id, context.handoffSnapshot.workingDirectory),
            ...normalizedSwitchConfig,
            agent: targetDriver,
            driverSwitch: {
                targetDriver,
                handoffSnapshot: context.handoffSnapshot
            }
        })
        if (spawnResult.type !== 'success') {
            const rollback = await this.rollbackDriverSwitchMetadata(context.session.id, context.previousDriver)
            return createDriverSwitchError(spawnResult.message, {
                code: 'spawn_failed',
                stage: 'spawn',
                targetDriver,
                rollbackResult: rollback,
                session: this.getSession(context.session.id)
            })
        }
        if (spawnResult.sessionId === context.session.id) {
            return null
        }

        await this.cleanupUnexpectedSwitchSpawn(context.session.id, spawnResult.sessionId)
        const rollback = await this.rollbackDriverSwitchMetadata(context.session.id, context.previousDriver)
        return createDriverSwitchError('Session failed to switch into the original hub session', {
            code: 'spawn_session_mismatch',
            stage: 'spawn',
            targetDriver,
            rollbackResult: rollback,
            session: this.getSession(context.session.id)
        })
    }

    private async finalizeDriverSwitch(
        context: DriverSwitchValidation,
        targetDriver: SessionDriver
    ): Promise<DriverSwitchResult> {
        const attachState = await this.waitForDriverSwitchAttach(context.session.id)
        if (attachState !== 'attached') {
            const rollback = await this.rollbackDriverSwitchMetadata(context.session.id, context.previousDriver)
            return createDriverSwitchError('Session attach timed out after driver switch spawn', {
                code: 'attach_timeout',
                stage: 'attach',
                targetDriver,
                rollbackResult: rollback,
                session: this.getSession(context.session.id)
            })
        }

        try {
            const switchedSession = await this.sessionCache.mutateSessionMetadata(context.session.id, (currentMetadata) => ({
                ...currentMetadata,
                driver: targetDriver
            }), {
                touchUpdatedAt: false
            })
            return {
                type: 'success',
                session: switchedSession,
                targetDriver
            }
        } catch (error) {
            const rollback = await this.rollbackDriverSwitchMetadata(context.session.id, context.previousDriver)
            const message = error instanceof Error ? error.message : 'Failed to commit target driver after switch attach'
            return createDriverSwitchError(message, {
                code: 'attach_failed',
                stage: 'attach',
                targetDriver,
                rollbackResult: rollback,
                session: this.getSession(context.session.id)
            })
        }
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

    private async waitForDriverSwitchStop(
        sessionId: string,
        timeoutMs: number = DRIVER_SWITCH_CONTRACT_TIMEOUT_MS
    ): Promise<'stopped' | 'timeout'> {
        const session = this.getSession(sessionId)
        if (!session?.active) {
            return 'stopped'
        }

        return await this.sessionCache.waitForSessionCondition(sessionId, {
            timeoutMs,
            resolveValue: (currentSession) => currentSession?.active ? null : 'stopped',
            onTimeout: () => 'timeout',
            isRelevantEvent: (event) =>
                event.type === 'session-added'
                || event.type === 'session-updated'
                || event.type === 'session-removed'
        })
    }

    private async waitForDriverSwitchAttach(
        sessionId: string,
        timeoutMs: number = DRIVER_SWITCH_CONTRACT_TIMEOUT_MS
    ): Promise<DriverSwitchAttachState> {
        const session = this.getSession(sessionId)
        if (session?.active) {
            return 'attached'
        }

        return await this.sessionCache.waitForSessionCondition(sessionId, {
            timeoutMs,
            resolveValue: (currentSession) => currentSession?.active ? 'attached' : null,
            onTimeout: () => 'timeout',
            isRelevantEvent: (event) =>
                event.type === 'session-added'
                || event.type === 'session-updated'
                || event.type === 'session-removed'
        })
    }

    private async rollbackDriverSwitchMetadata(
        sessionId: string,
        previousDriver: SessionDriver | null
    ): Promise<DriverSwitchRollbackResult> {
        const session = this.getSession(sessionId)
        if ((resolveSessionDriver(session?.metadata) ?? null) === previousDriver) {
            return 'not_needed'
        }

        try {
            await this.sessionCache.mutateSessionMetadata(sessionId, (currentMetadata) => {
                if (!previousDriver) {
                    return {
                        ...currentMetadata,
                        driver: undefined
                    }
                }

                return {
                    ...currentMetadata,
                    driver: previousDriver
                }
            }, {
                touchUpdatedAt: false
            })
            return 'session_metadata_restored'
        } catch {
            return 'session_metadata_restore_failed'
        }
    }

    private async cleanupUnexpectedSwitchSpawn(
        originalSessionId: string,
        spawnedSessionId: string
    ): Promise<void> {
        try {
            await this.rpcGateway.killSession(spawnedSessionId)
        } catch {
            // Best effort cleanup; the caller reports the authoritative switch failure.
        }

        this.sessionCache.handleSessionEnd({ sid: spawnedSessionId, time: Date.now() })

        if (spawnedSessionId !== originalSessionId) {
            try {
                await this.sessionCache.deleteSession(spawnedSessionId)
            } catch {
                // If the unexpected session never persisted, there is nothing left to clean up.
            }
        }
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
            agent: resolveSessionSpawnDriver(session.metadata),
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
