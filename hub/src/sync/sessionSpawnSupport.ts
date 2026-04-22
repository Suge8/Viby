import { getSessionLifecycleState, type SessionDriver, type SessionHandoffSnapshot } from '@viby/protocol'
import type { Session } from '@viby/protocol/types'
import { MachineCache } from './machineCache'
import { RpcGateway } from './rpcGateway'
import { SessionCache } from './sessionCache'
import {
    buildSessionSpawnOptions,
    DRIVER_SWITCH_CONTRACT_TIMEOUT_MS,
    RESUME_CONTRACT_TIMEOUT_MS,
    readResumeToken,
    resolveResumeTargetMachine,
    SPAWN_ACTIVE_SETTLE_TIMEOUT_MS,
    withSessionResumeToken,
} from './sessionSpawnContracts'
import {
    buildResumeContinuityHandoffSnapshot,
    cleanupFailedResumeSpawn,
    cleanupUnexpectedSwitchSpawnState,
    getSpawnSupportSession,
    rollbackDriverSwitchMetadataState,
    waitForDriverSwitchState,
    waitForResumedSessionContractState,
    waitForSpawnSupportSessionState,
} from './sessionSpawnSupportRuntime'
import type {
    ResumeContractState,
    SessionSpawnOptions,
    SessionSpawnPreparationResult,
    SessionStateResolver,
    SpawnInactiveSessionResult,
} from './sessionSpawnSupportTypes'

export type {
    ResumeContractState,
    SessionSpawnPreparationResult,
    SpawnInactiveSessionResult,
} from './sessionSpawnSupportTypes'

export class SessionSpawnSupport {
    constructor(
        private readonly sessionCache: SessionCache,
        private readonly machineCache: MachineCache,
        private readonly rpcGateway: RpcGateway
    ) {}

    prepareSessionSpawn(
        session: Session,
        options: {
            archivedMessage: string
            includeResumeToken: boolean
        }
    ): SessionSpawnPreparationResult {
        if (getSessionLifecycleState(session) === 'archived') {
            return { type: 'error', code: 'session_archived', message: options.archivedMessage }
        }

        const metadata = session.metadata
        if (!metadata || typeof metadata.path !== 'string') {
            return { type: 'error', code: 'resume_unavailable', message: 'Session metadata missing path' }
        }

        const targetMachine = resolveResumeTargetMachine(this.machineCache, session)
        if (!targetMachine) {
            return { type: 'error', code: 'no_machine_online', message: 'No machine online' }
        }

        const resumeToken = readResumeToken(session, options.includeResumeToken)

        return {
            type: 'success',
            resumeToken,
            spawnOptions: buildSessionSpawnOptions(session, targetMachine.id, metadata.path, resumeToken),
        }
    }

    buildResumeContinuityHandoff(
        sessionId: string,
        buildSessionHandoff: (sessionId: string) => SessionHandoffSnapshot
    ): SessionHandoffSnapshot | string {
        return buildResumeContinuityHandoffSnapshot(sessionId, buildSessionHandoff)
    }

    async spawnInactiveSession(spawnOptions: SessionSpawnOptions): Promise<SpawnInactiveSessionResult> {
        const spawnResult = await this.rpcGateway.spawnSession(spawnOptions)
        if (spawnResult.type !== 'success') {
            return { type: 'error', message: spawnResult.message }
        }

        const becameActive = await this.waitForSessionState(spawnResult.sessionId, {
            timeoutMs: SPAWN_ACTIVE_SETTLE_TIMEOUT_MS,
            resolveValue: (session) => (session?.active ? true : null),
            onTimeout: () => false,
        })
        if (!becameActive) {
            return {
                type: 'error',
                message: 'Session remained inactive after start',
            }
        }

        const normalizedSession = await this.sessionCache.transitionSessionLifecycle(spawnResult.sessionId, 'running', {
            touchUpdatedAt: false,
        })

        return { type: 'success', sessionId: normalizedSession.id }
    }

    async defaultCleanupFailedResumeSpawn(
        originalSessionId: string,
        spawnedSessionId: string,
        resumeToken: string
    ): Promise<string | null> {
        return await cleanupFailedResumeSpawn({
            originalSessionId,
            resumeToken,
            rpcGateway: this.rpcGateway,
            sessionCache: this.sessionCache,
            spawnedSessionId,
        })
    }

    async defaultWaitForResumedSessionContract(
        sessionId: string,
        resumeToken: string,
        timeoutMs: number = RESUME_CONTRACT_TIMEOUT_MS
    ): Promise<ResumeContractState> {
        return await waitForResumedSessionContractState({
            getSession: (targetSessionId) => this.getSession(targetSessionId),
            sessionCache: this.sessionCache,
            sessionId,
            resumeToken,
            timeoutMs,
        })
    }

    async defaultWriteSessionResumeToken(sessionId: string, token: string | undefined): Promise<void> {
        await this.sessionCache.mutateSessionMetadata(
            sessionId,
            (currentMetadata) => {
                return withSessionResumeToken(currentMetadata, token) ?? currentMetadata
            },
            {
                touchUpdatedAt: false,
            }
        )
    }

    async waitForDriverSwitchStop(
        sessionId: string,
        timeoutMs: number = DRIVER_SWITCH_CONTRACT_TIMEOUT_MS
    ): Promise<'stopped' | 'timeout'> {
        const result = await waitForDriverSwitchState({
            sessionId,
            timeoutMs,
            sessionCache: this.sessionCache,
            getSession: (targetSessionId) => this.getSession(targetSessionId),
            target: 'stopped',
        })
        return result === 'attached' ? 'timeout' : result
    }

    async waitForDriverSwitchAttach(
        sessionId: string,
        timeoutMs: number = DRIVER_SWITCH_CONTRACT_TIMEOUT_MS
    ): Promise<'attached' | 'timeout'> {
        const result = await waitForDriverSwitchState({
            sessionId,
            timeoutMs,
            sessionCache: this.sessionCache,
            getSession: (targetSessionId) => this.getSession(targetSessionId),
            target: 'attached',
        })
        return result === 'stopped' ? 'timeout' : result
    }

    async rollbackDriverSwitchMetadata(
        sessionId: string,
        previousDriver: SessionDriver | null
    ): Promise<'not_started' | 'not_needed' | 'session_metadata_restored' | 'session_metadata_restore_failed'> {
        return await rollbackDriverSwitchMetadataState({
            sessionId,
            previousDriver,
            sessionCache: this.sessionCache,
            getSession: (targetSessionId) => this.getSession(targetSessionId),
        })
    }

    async cleanupUnexpectedSwitchSpawn(originalSessionId: string, spawnedSessionId: string): Promise<void> {
        await cleanupUnexpectedSwitchSpawnState({
            originalSessionId,
            rpcGateway: this.rpcGateway,
            sessionCache: this.sessionCache,
            spawnedSessionId,
        })
    }

    buildSessionSpawnOptions(
        session: Session,
        machineId: string,
        directory: string,
        resumeSessionId?: string
    ): SessionSpawnOptions {
        return buildSessionSpawnOptions(session, machineId, directory, resumeSessionId)
    }

    resolveResumeTargetMachine(session: Session) {
        return resolveResumeTargetMachine(this.machineCache, session)
    }

    private getSession(sessionId: string): Session | undefined {
        return getSpawnSupportSession(this.sessionCache, sessionId)
    }

    private async waitForSessionState<T>(
        sessionId: string,
        options: {
            timeoutMs: number
            resolveValue: SessionStateResolver<T>
            onTimeout: () => T
        }
    ): Promise<T> {
        return await waitForSpawnSupportSessionState(this.sessionCache, sessionId, options)
    }
}
