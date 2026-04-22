import {
    resolveSessionDriver,
    SAME_SESSION_SWITCH_TARGET_DRIVERS,
    type SessionDriver,
    type SessionHandoffSnapshot,
} from '@viby/protocol'
import type { Session } from '@viby/protocol/types'
import { RpcGateway } from './rpcGateway'
import { SessionCache } from './sessionCache'
import {
    buildDriverSwitchHandoffSnapshot,
    createDriverSwitchError,
    type DriverSwitchErrorCode,
    type DriverSwitchResult,
    type DriverSwitchRollbackResult,
    type DriverSwitchStage,
} from './sessionDriverSwitchSupport'
import { SessionSpawnSupport } from './sessionSpawnSupport'
import { type NormalizedDriverSwitchConfig, normalizeDriverSwitchConfig } from './sessionSwitchConfig'

export type {
    DriverSwitchErrorCode,
    DriverSwitchResult,
    DriverSwitchRollbackResult,
    DriverSwitchStage,
} from './sessionDriverSwitchSupport'

type DriverSwitchHooks = {
    buildSessionHandoff: (sessionId: string) => SessionHandoffSnapshot
}

type DriverSwitchValidation = {
    session: Session
    previousDriver: SessionDriver | null
}

type DriverSwitchSpawnContext = DriverSwitchValidation & {
    handoffSnapshot: SessionHandoffSnapshot
    normalizedSwitchConfig: NormalizedDriverSwitchConfig
}

const SUPPORTED_DRIVER_SWITCH_TARGETS = new Set<SessionDriver>(SAME_SESSION_SWITCH_TARGET_DRIVERS)

export class SessionDriverSwitchService {
    constructor(
        private readonly sessionCache: SessionCache,
        private readonly rpcGateway: RpcGateway,
        private readonly sessionSpawnSupport: SessionSpawnSupport,
        private readonly getSession: (sessionId: string) => Session | undefined
    ) {}

    async switchSessionDriver(
        sessionId: string,
        targetDriver: SessionDriver,
        hooks: DriverSwitchHooks
    ): Promise<DriverSwitchResult> {
        const validation = this.validateDriverSwitchRequest(sessionId, targetDriver)
        if ('type' in validation) {
            return validation
        }

        const availabilityError = await this.ensureTargetDriverAvailability(validation.session, targetDriver)
        if (availabilityError) {
            return availabilityError
        }

        const handoffResult = this.buildDriverSwitchHandoff(sessionId, targetDriver, validation.session, hooks)
        if ('type' in handoffResult) {
            return handoffResult
        }

        const stopError = await this.stopDriverSwitchSourceSession(validation.session, targetDriver)
        if (stopError) {
            return stopError
        }

        const spawnContext: DriverSwitchSpawnContext = {
            ...validation,
            handoffSnapshot: handoffResult,
            normalizedSwitchConfig: normalizeDriverSwitchConfig(validation.session, targetDriver),
        }

        const spawnError = await this.spawnDriverSwitchTargetSession(spawnContext, targetDriver)
        if (spawnError) {
            return spawnError
        }

        return await this.finalizeDriverSwitch(spawnContext, targetDriver)
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
                targetDriver,
            })
        }
        if (!SUPPORTED_DRIVER_SWITCH_TARGETS.has(targetDriver)) {
            return createDriverSwitchError('Unsupported target driver', {
                code: 'unsupported_target_driver',
                stage: 'idle_gate',
                targetDriver,
                session,
            })
        }
        const previousDriver = resolveSessionDriver(session.metadata)
        if (previousDriver === targetDriver) {
            return createDriverSwitchError('Target driver already owns this session', {
                code: 'target_driver_matches_current',
                stage: 'idle_gate',
                targetDriver,
                session,
            })
        }
        if (!session.active || session.thinking) {
            return createDriverSwitchError('Driver switching requires an idle active session', {
                code: 'session_not_idle',
                stage: 'idle_gate',
                targetDriver,
                session,
            })
        }

        return {
            session,
            previousDriver,
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
                session,
            })
        }
    }

    private async ensureTargetDriverAvailability(
        session: Session,
        targetDriver: SessionDriver
    ): Promise<Extract<DriverSwitchResult, { type: 'error' }> | null> {
        const targetMachine = this.sessionSpawnSupport.resolveResumeTargetMachine(session)
        if (!targetMachine) {
            return null
        }

        const availability = await this.rpcGateway.listAgentAvailability(targetMachine.id, {
            directory: session.metadata?.path,
        })
        const targetAvailability = availability.agents.find((candidate) => candidate.driver === targetDriver)
        if (targetAvailability?.status === 'ready') {
            return null
        }

        return createDriverSwitchError(targetAvailability?.reason ?? 'Target driver is unavailable on this machine', {
            code: 'target_driver_unavailable',
            stage: 'idle_gate',
            targetDriver,
            session: this.getSession(session.id) ?? session,
        })
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
                session: this.getSession(session.id) ?? session,
            })
        }

        const stopState = await this.sessionSpawnSupport.waitForDriverSwitchStop(session.id)
        if (stopState === 'stopped') {
            return null
        }

        return createDriverSwitchError('Session stop timed out before driver switch spawn', {
            code: 'stop_timeout',
            stage: 'stop',
            targetDriver,
            session: this.getSession(session.id) ?? session,
        })
    }

    private async spawnDriverSwitchTargetSession(
        context: DriverSwitchSpawnContext,
        targetDriver: SessionDriver
    ): Promise<Extract<DriverSwitchResult, { type: 'error' }> | null> {
        const targetMachine = this.sessionSpawnSupport.resolveResumeTargetMachine(context.session)
        if (!targetMachine) {
            return createDriverSwitchError('No machine online', {
                code: 'spawn_failed',
                stage: 'spawn',
                targetDriver,
                session: this.getSession(context.session.id) ?? context.session,
                rollbackResult: 'not_needed',
            })
        }

        const handoffSnapshot = buildDriverSwitchHandoffSnapshot(
            context.handoffSnapshot,
            context.normalizedSwitchConfig
        )
        const spawnResult = await this.rpcGateway.spawnSession({
            ...this.sessionSpawnSupport.buildSessionSpawnOptions(
                context.session,
                targetMachine.id,
                handoffSnapshot.workingDirectory
            ),
            ...context.normalizedSwitchConfig.spawnConfig,
            agent: targetDriver,
            driverSwitch: {
                targetDriver,
                handoffSnapshot,
            },
        })

        if (spawnResult.type !== 'success') {
            const rollback = await this.sessionSpawnSupport.rollbackDriverSwitchMetadata(
                context.session.id,
                context.previousDriver
            )
            return createDriverSwitchError(spawnResult.message, {
                code: 'spawn_failed',
                stage: 'spawn',
                targetDriver,
                rollbackResult: rollback,
                session: this.getSession(context.session.id),
            })
        }
        if (spawnResult.sessionId === context.session.id) {
            return null
        }

        await this.sessionSpawnSupport.cleanupUnexpectedSwitchSpawn(context.session.id, spawnResult.sessionId)
        const rollback = await this.sessionSpawnSupport.rollbackDriverSwitchMetadata(
            context.session.id,
            context.previousDriver
        )
        return createDriverSwitchError('Session failed to switch into the original hub session', {
            code: 'spawn_session_mismatch',
            stage: 'spawn',
            targetDriver,
            rollbackResult: rollback,
            session: this.getSession(context.session.id),
        })
    }

    private async finalizeDriverSwitch(
        context: DriverSwitchSpawnContext,
        targetDriver: SessionDriver
    ): Promise<DriverSwitchResult> {
        const attachState = await this.sessionSpawnSupport.waitForDriverSwitchAttach(context.session.id)
        if (attachState !== 'attached') {
            const rollback = await this.sessionSpawnSupport.rollbackDriverSwitchMetadata(
                context.session.id,
                context.previousDriver
            )
            return createDriverSwitchError('Session attach timed out after driver switch spawn', {
                code: 'attach_timeout',
                stage: 'attach',
                targetDriver,
                rollbackResult: rollback,
                session: this.getSession(context.session.id),
            })
        }

        try {
            const metadataCommittedSession = await this.sessionCache.mutateSessionMetadata(
                context.session.id,
                (currentMetadata) => ({
                    ...currentMetadata,
                    driver: targetDriver,
                }),
                {
                    touchUpdatedAt: false,
                }
            )
            this.sessionCache.applySessionConfig(context.session.id, {
                ...context.normalizedSwitchConfig.durableConfig,
            })
            const switchedSession = this.getSession(context.session.id) ?? metadataCommittedSession
            return {
                type: 'success',
                session: switchedSession,
                targetDriver,
            }
        } catch (error) {
            const repairError = await this.repairAttachedDriverSwitchState(context, targetDriver)
            const baseMessage =
                error instanceof Error ? error.message : 'Failed to commit target driver after switch attach'
            const message = repairError ? `${baseMessage}; repair failed: ${repairError}` : baseMessage
            return createDriverSwitchError(message, {
                code: 'attach_failed',
                stage: 'attach',
                targetDriver,
                rollbackResult: 'not_needed',
                session: this.getSession(context.session.id),
            })
        }
    }

    private async repairAttachedDriverSwitchState(
        context: DriverSwitchSpawnContext,
        targetDriver: SessionDriver
    ): Promise<string | null> {
        try {
            await this.sessionCache.mutateSessionMetadata(
                context.session.id,
                (currentMetadata) => ({
                    ...currentMetadata,
                    driver: targetDriver,
                }),
                {
                    touchUpdatedAt: false,
                }
            )
            this.sessionCache.applySessionConfig(context.session.id, context.normalizedSwitchConfig.durableConfig)
            return null
        } catch (error) {
            return error instanceof Error ? error.message : 'Failed to repair attached driver-switch state'
        }
    }
}
