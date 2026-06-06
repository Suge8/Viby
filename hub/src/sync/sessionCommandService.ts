import {
    getLiveSessionConfigSupport,
    getPermissionModesForDriver,
    isModelReasoningEffortAllowedForDriver,
    isPermissionModeAllowedForDriver,
    resolveSessionDriver,
    supportsLiveModelReasoningEffortForDriver,
    supportsLiveModelSelectionForDriver,
} from '@viby/protocol'
import type {
    CodexCollaborationMode,
    CodexServiceTier,
    ModelReasoningEffort,
    PermissionMode,
    Session,
} from '@viby/protocol/types'
import type { RpcGateway } from './rpcGateway'
import type { SessionCache } from './sessionCache'
import {
    getSessionCommandResumeStatus,
    type SessionCommand,
    SessionCommandError,
    type SessionCommandResult,
    type SessionCommandResumeResult,
    toSessionCommandError,
} from './sessionCommandTypes'
import type { DriverSwitchResult, SessionLifecycleService } from './sessionLifecycleService'
import type { DriverSwitchHooks } from './sessionLifecycleSupport'
import type { SessionConfigPatch } from './sessionPayloadTypes'
import type { SessionRpcFacade } from './sessionRpcFacade'

export type {
    SessionCommand,
    SessionCommandErrorCode,
    SessionCommandRequest,
    SessionCommandResult,
    SessionCommandResumeResult,
} from './sessionCommandTypes'
export { getSessionCommandResumeStatus, SessionCommandError }

export class SessionCommandService {
    constructor(
        private readonly sessionCache: SessionCache,
        private readonly rpcGateway: RpcGateway,
        private readonly sessionLifecycleService: SessionLifecycleService,
        private readonly sessionRpcFacade: SessionRpcFacade
    ) {}
    async executeSessionCommand(command: SessionCommand): Promise<SessionCommandResult> {
        try {
            switch (command.type) {
                case 'abort':
                    return { ok: true, command: command.type, session: await this.abort(command.sessionId) }
                case 'close':
                    return {
                        ok: true,
                        command: command.type,
                        session: await this.sessionLifecycleService.closeSession(command.sessionId),
                    }
                case 'archive':
                    return {
                        ok: true,
                        command: command.type,
                        session: await this.sessionLifecycleService.archiveSession(command.sessionId),
                    }
                case 'unarchive':
                    return {
                        ok: true,
                        command: command.type,
                        session: await this.sessionLifecycleService.unarchiveSession(command.sessionId),
                    }
                case 'resume': {
                    const resume = await this.resume(
                        command.sessionId,
                        command.hooks,
                        command.permissionMode === undefined ? undefined : { permissionMode: command.permissionMode }
                    )
                    if (resume.type === 'error') {
                        return {
                            ok: false,
                            command: command.type,
                            error: {
                                message: resume.message,
                                code: resume.code,
                                status: getSessionCommandResumeStatus(resume.code),
                            },
                        }
                    }
                    return { ok: true, command: command.type, resume }
                }
                case 'driver-switch': {
                    const driverSwitch = await this.sessionLifecycleService.switchSessionDriver(
                        command.sessionId,
                        command.targetDriver,
                        command.hooks
                    )
                    if (driverSwitch.type === 'error') {
                        return {
                            ok: false,
                            command: command.type,
                            error: {
                                message: driverSwitch.message,
                                code: 'session_action_failed',
                                status: driverSwitch.status,
                            },
                            driverSwitch,
                        }
                    }
                    return { ok: true, command: command.type, session: driverSwitch.session, driverSwitch }
                }
                case 'permission-mode':
                    return {
                        ok: true,
                        command: command.type,
                        session: await this.setPermission(command.sessionId, command.mode),
                    }
                case 'collaboration-mode':
                    return {
                        ok: true,
                        command: command.type,
                        session: await this.setCollaboration(command.sessionId, command.mode),
                    }
                case 'model':
                    return {
                        ok: true,
                        command: command.type,
                        session: await this.setLiveModel(command.sessionId, command.model),
                    }
                case 'model-reasoning-effort':
                    return {
                        ok: true,
                        command: command.type,
                        session: await this.setReasoning(command.sessionId, command.modelReasoningEffort),
                    }
                case 'codex-service-tier':
                    return {
                        ok: true,
                        command: command.type,
                        session: await this.setCodexTier(command.sessionId, command.codexServiceTier),
                    }
            }
        } catch (error) {
            return { ok: false, command: command.type, error: toSessionCommandError(error) }
        }
    }

    private async applySessionConfig(sessionId: string, config: SessionConfigPatch): Promise<void> {
        const session = this.requireSession(sessionId)
        if (!session.active) {
            this.sessionCache.applySessionConfig(sessionId, config)
            return
        }
        await this.sessionRpcFacade.requestSessionConfig(sessionId, config)
    }

    private async abort(sessionId: string): Promise<Session> {
        const current = this.requireSession(sessionId)
        if (!current.active) {
            throw new SessionCommandError('Session is inactive', 'session_action_failed', 409)
        }
        await this.rpcGateway.abortSession(sessionId)
        await this.sessionCache.setSessionLifecycleState(sessionId, 'open', { touchUpdatedAt: false })
        return this.sessionCache.setSessionThinking(sessionId, false) ?? this.missingSession()
    }

    private async resume(
        sessionId: string,
        hooks?: Parameters<SessionLifecycleService['resumeSession']>[1],
        opts?: { permissionMode?: PermissionMode }
    ): Promise<SessionCommandResumeResult> {
        if (opts?.permissionMode !== undefined) {
            const session = this.requireSession(sessionId)
            const driver = resolveSessionDriver(session.metadata)
            if (!driver || !isPermissionModeAllowedForDriver(opts.permissionMode, driver)) {
                return {
                    type: 'error',
                    message: 'Invalid permission mode for session driver',
                    code: 'session_action_failed',
                }
            }
        }
        return await this.sessionLifecycleService.resumeSession(sessionId, hooks, opts)
    }
    private async setPermission(sessionId: string, mode: PermissionMode): Promise<Session> {
        const session = this.requireSession(sessionId)
        const driver = resolveSessionDriver(session.metadata)
        const liveConfigSupport = getLiveSessionConfigSupport(session)
        if (session.active && !liveConfigSupport.canChangePermissionMode) {
            throw new SessionCommandError(
                'Permission mode can only be changed for Viby-managed active sessions',
                'session_action_failed',
                409
            )
        }
        if (!driver || getPermissionModesForDriver(driver).length === 0) {
            throw new SessionCommandError(
                'Permission mode not supported for session driver',
                'session_action_failed',
                400
            )
        }
        if (!isPermissionModeAllowedForDriver(mode, driver)) {
            throw new SessionCommandError('Invalid permission mode for session driver', 'session_action_failed', 400)
        }
        return await this.applySessionConfigAndReturnSnapshot(sessionId, { permissionMode: mode })
    }

    private async setCollaboration(sessionId: string, collaborationMode: CodexCollaborationMode): Promise<Session> {
        const session = this.requireActiveSession(sessionId)
        if (resolveSessionDriver(session.metadata) !== 'codex') {
            throw new SessionCommandError(
                'Collaboration mode is only supported for Codex sessions',
                'session_action_failed',
                400
            )
        }
        if (!getLiveSessionConfigSupport(session).canChangeCollaborationMode) {
            throw new SessionCommandError(
                'Collaboration mode can only be changed for Viby-managed Codex sessions',
                'session_action_failed',
                409
            )
        }
        return await this.applySessionConfigAndReturnSnapshot(sessionId, { collaborationMode })
    }

    private async setLiveModel(sessionId: string, model: string | null): Promise<Session> {
        const session = this.requireActiveSession(sessionId)
        const driver = resolveSessionDriver(session.metadata)
        const liveConfigSupport = getLiveSessionConfigSupport(session)
        if (!driver || !supportsLiveModelSelectionForDriver(driver)) {
            throw new SessionCommandError(
                'Live model selection is only supported for Claude, Codex, Gemini, and Pi sessions',
                'session_action_failed',
                400
            )
        }
        if (!liveConfigSupport.canChangeModel) {
            throw new SessionCommandError(
                'Model selection can only be changed for Viby-managed Claude, Codex, Gemini, and Pi sessions',
                'session_action_failed',
                409
            )
        }
        return await this.applySessionConfigAndReturnSnapshot(sessionId, { model })
    }

    private async setReasoning(sessionId: string, modelReasoningEffort: ModelReasoningEffort | null): Promise<Session> {
        const session = this.requireActiveSession(sessionId)
        const driver = resolveSessionDriver(session.metadata)
        const liveConfigSupport = getLiveSessionConfigSupport(session)
        if (!driver || !supportsLiveModelReasoningEffortForDriver(driver)) {
            throw new SessionCommandError(
                'Live model reasoning effort is only supported for Claude, Codex, and Pi sessions',
                'session_action_failed',
                400
            )
        }
        if (!liveConfigSupport.canChangeModelReasoningEffort) {
            throw new SessionCommandError(
                'Model reasoning effort can only be changed for Viby-managed Claude, Codex, and Pi sessions',
                'session_action_failed',
                409
            )
        }
        if (modelReasoningEffort !== null && !isModelReasoningEffortAllowedForDriver(modelReasoningEffort, driver)) {
            throw new SessionCommandError(
                'Invalid model reasoning effort for session driver',
                'session_action_failed',
                400
            )
        }
        return await this.applySessionConfigAndReturnSnapshot(sessionId, { modelReasoningEffort })
    }

    private async setCodexTier(sessionId: string, codexServiceTier: CodexServiceTier | null): Promise<Session> {
        const session = this.requireActiveSession(sessionId)
        const driver = resolveSessionDriver(session.metadata)
        const liveConfigSupport = getLiveSessionConfigSupport(session)
        if (driver !== 'codex') {
            throw new SessionCommandError(
                'Codex fast mode is only supported for Codex sessions',
                'session_action_failed',
                400
            )
        }
        if (!liveConfigSupport.canChangeCodexServiceTier) {
            throw new SessionCommandError(
                'Codex fast mode can only be changed for Viby-managed Codex sessions',
                'session_action_failed',
                409
            )
        }
        return await this.applySessionConfigAndReturnSnapshot(sessionId, { codexServiceTier })
    }

    private requireSession(sessionId: string): Session {
        const session = this.sessionCache.getSession(sessionId) ?? this.sessionCache.refreshSession(sessionId)
        if (!session) {
            throw new SessionCommandError('Session not found', 'session_not_found', 404)
        }
        return session
    }

    private requireActiveSession(sessionId: string): Session {
        const session = this.requireSession(sessionId)
        if (!session.active) {
            throw new SessionCommandError('Session is inactive', 'session_action_failed', 409)
        }
        return session
    }

    private async applySessionConfigAndReturnSnapshot(sessionId: string, config: SessionConfigPatch): Promise<Session> {
        await this.applySessionConfig(sessionId, config)
        return this.requireSessionSnapshot(sessionId)
    }

    private requireSessionSnapshot(sessionId: string): Session {
        const session = this.sessionCache.getSession(sessionId)
        if (!session) {
            throw new SessionCommandError('Session snapshot unavailable after config update', 'session_not_found', 500)
        }
        return session
    }

    private missingSession(): never {
        throw new SessionCommandError('Session not found', 'session_not_found', 404)
    }
}
