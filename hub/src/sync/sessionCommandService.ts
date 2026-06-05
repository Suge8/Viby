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
import type { DriverSwitchResult, ResumeSessionResult, SessionLifecycleService } from './sessionLifecycleService'
import type { DriverSwitchHooks } from './sessionLifecycleSupport'
import type { SessionConfigPatch } from './sessionPayloadTypes'
import type { SessionRpcFacade } from './sessionRpcFacade'

export type SessionCommandErrorCode =
    | 'session_not_found'
    | 'no_machine_online'
    | 'resume_unavailable'
    | 'resume_failed'
    | 'session_archived'
    | 'session_action_failed'

export type SessionCommandResumeResult =
    | ResumeSessionResult
    | { type: 'error'; message: string; code: 'session_action_failed' }

export class SessionCommandError extends Error {
    constructor(
        message: string,
        readonly code: SessionCommandErrorCode,
        readonly status: 400 | 404 | 409 | 500 | 503
    ) {
        super(message)
        this.name = 'SessionCommandError'
    }
}

export function getSessionCommandResumeStatus(code: SessionCommandErrorCode): 400 | 404 | 409 | 500 | 503 {
    switch (code) {
        case 'no_machine_online':
            return 503
        case 'session_not_found':
            return 404
        case 'session_archived':
            return 409
        case 'session_action_failed':
            return 400
        default:
            return 500
    }
}

export class SessionCommandService {
    constructor(
        private readonly sessionCache: SessionCache,
        private readonly rpcGateway: RpcGateway,
        private readonly sessionLifecycleService: SessionLifecycleService,
        private readonly sessionRpcFacade: SessionRpcFacade
    ) {}

    async abortSession(sessionId: string): Promise<Session> {
        const current = this.sessionCache.getSession(sessionId) ?? this.sessionCache.refreshSession(sessionId)
        if (!current) {
            throw new SessionCommandError('Session not found', 'session_not_found', 404)
        }
        if (!current.active) {
            throw new SessionCommandError('Session is inactive', 'session_action_failed', 409)
        }

        await this.rpcGateway.abortSession(sessionId)
        await this.sessionCache.setSessionLifecycleState(sessionId, 'open', {
            touchUpdatedAt: false,
        })
        const session = this.sessionCache.setSessionThinking(sessionId, false)
        if (!session) {
            throw new SessionCommandError('Session not found', 'session_not_found', 404)
        }
        return session
    }

    async closeSession(sessionId: string): Promise<Session> {
        return await this.sessionLifecycleService.closeSession(sessionId)
    }

    async archiveSession(sessionId: string): Promise<Session> {
        return await this.sessionLifecycleService.archiveSession(sessionId)
    }

    async unarchiveSession(sessionId: string): Promise<Session> {
        return await this.sessionLifecycleService.unarchiveSession(sessionId)
    }

    async resumeSession(
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

    async switchSessionDriver(
        sessionId: string,
        targetDriver: Parameters<SessionLifecycleService['switchSessionDriver']>[1],
        hooks: DriverSwitchHooks
    ): Promise<DriverSwitchResult> {
        return await this.sessionLifecycleService.switchSessionDriver(sessionId, targetDriver, hooks)
    }

    async applySessionConfig(sessionId: string, config: SessionConfigPatch): Promise<void> {
        const session = this.requireSession(sessionId)
        if (!session.active) {
            this.sessionCache.applySessionConfig(sessionId, config)
            return
        }
        await this.sessionRpcFacade.requestSessionConfig(sessionId, config)
    }

    async setPermissionMode(sessionId: string, mode: PermissionMode): Promise<Session> {
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
        const allowedModes = driver ? getPermissionModesForDriver(driver) : []
        if (allowedModes.length === 0) {
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

    async setCollaborationMode(sessionId: string, collaborationMode: CodexCollaborationMode): Promise<Session> {
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

    async setModel(sessionId: string, model: string | null): Promise<Session> {
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

    async setModelReasoningEffort(
        sessionId: string,
        modelReasoningEffort: ModelReasoningEffort | null
    ): Promise<Session> {
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

    async setCodexServiceTier(sessionId: string, codexServiceTier: CodexServiceTier | null): Promise<Session> {
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
}
