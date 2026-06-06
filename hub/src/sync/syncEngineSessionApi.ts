import { resolveSessionDriver } from '@viby/protocol'
import type { ProviderAdapterRuntimeEvent } from '@viby/protocol/providerAdapterProtocol'
import type {
    AgentFlavor,
    ListAgentAvailabilityRequest,
    LocalSessionCatalogRequest,
    LocalSessionExportRequest,
    OpenAgentConfigRequest,
    PermissionMode,
    ResolveAgentLaunchConfigRequest,
    RestoreAgentConfigRequest,
    RuntimeCapabilityRequest,
    RuntimeCapabilitySnapshot,
    SaveAgentConfigRequest,
    Session,
    SessionSendMessageResult,
} from '@viby/protocol/types'
import type { RuntimeSpawnValidationOptions } from '../runtime/runtimeCapabilityValidation'
import {
    type SessionCommand,
    SessionCommandError,
    type SessionCommandRequest,
    type SessionCommandResult,
    type SessionCommandResumeResult,
} from './sessionCommandService'
import type { ResumeContractState } from './sessionLifecycleService'
import type { InternalSessionMessagePayload, SessionSendMessagePayload } from './sessionPayloadTypes'
import { SyncEngineReadApi } from './syncEngineReadApi'
import type { SyncEngineServices } from './syncEngineServiceFactory'

export type SyncEngineSpawnSessionOptions = Parameters<SyncEngineServices['sessionRpcFacade']['spawnSession']>[0]

export abstract class SyncEngineSessionApi extends SyncEngineReadApi {
    protected abstract get syncServices(): SyncEngineServices

    private requireCommandSession(result: SessionCommandResult): Session {
        if (!result.ok) {
            throw new SessionCommandError(result.error.message, result.error.code, result.error.status)
        }
        if (!result.session) {
            throw new Error('Session command did not return a session')
        }
        return result.session
    }

    async sendMessage(sessionId: string, payload: SessionSendMessagePayload): Promise<SessionSendMessageResult> {
        return await this.syncServices.sessionInteractionService.sendMessage(sessionId, payload)
    }

    async cancelQueuedMessages(sessionId: string, localIds: string[]): Promise<string[]> {
        const session = this.getSession(sessionId)
        if (!session) {
            throw new Error('Session not found')
        }

        return await this.syncServices.messageService.cancelQueuedMessages(sessionId, localIds)
    }

    async appendInternalUserMessage(sessionId: string, payload: InternalSessionMessagePayload): Promise<Session> {
        return (await this.syncServices.sessionInteractionService.appendInternalUserMessage(sessionId, payload)).session
    }

    async approvePermission(
        sessionId: string,
        requestId: string,
        mode?: PermissionMode,
        allowTools?: string[],
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
        answers?: Record<string, string[]> | Record<string, { answers: string[] }>
    ): Promise<void> {
        await this.syncServices.sessionRpcFacade.approvePermission(
            sessionId,
            requestId,
            mode,
            allowTools,
            decision,
            answers
        )
    }

    async denyPermission(
        sessionId: string,
        requestId: string,
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    ): Promise<void> {
        await this.syncServices.sessionRpcFacade.denyPermission(sessionId, requestId, decision)
    }

    async executeSessionCommand(command: SessionCommandRequest): Promise<SessionCommandResult> {
        if (command.type === 'resume') {
            return await this.syncServices.sessionCommandService.executeSessionCommand({
                ...command,
                hooks: this.buildResumeHooks(),
            })
        }
        if (command.type === 'driver-switch') {
            const previousDriver = resolveSessionDriver(this.getSession(command.sessionId)?.metadata)
            const result = await this.syncServices.sessionCommandService.executeSessionCommand({
                ...command,
                hooks: { buildSessionHandoff: (targetSessionId) => this.buildSessionHandoff(targetSessionId) },
            })
            if (!result.ok || result.driverSwitch?.type !== 'success') {
                return result
            }
            if (!previousDriver || previousDriver === result.driverSwitch.targetDriver) {
                return result
            }
            try {
                await this.syncServices.messageService.appendDriverSwitchedEvent(command.sessionId, {
                    type: 'driver-switched',
                    previousDriver,
                    targetDriver: result.driverSwitch.targetDriver,
                })
                return result
            } catch (error) {
                return {
                    ok: false,
                    command: command.type,
                    error: {
                        message: error instanceof Error ? error.message : 'Failed to append driver switch marker',
                        code: 'session_action_failed',
                        status: 500,
                    },
                    driverSwitch: {
                        type: 'error',
                        message: error instanceof Error ? error.message : 'Failed to append driver switch marker',
                        code: 'marker_append_failed',
                        stage: 'marker_append',
                        status: 500,
                        targetDriver: result.driverSwitch.targetDriver,
                        rollbackResult: 'not_needed',
                        session: this.getSession(command.sessionId) ?? result.driverSwitch.session,
                    },
                }
            }
        }
        return await this.syncServices.sessionCommandService.executeSessionCommand(command as SessionCommand)
    }

    async unarchiveSession(sessionId: string): Promise<Session> {
        return this.requireCommandSession(await this.executeSessionCommand({ type: 'unarchive', sessionId }))
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.syncServices.sessionCache.deleteSession(sessionId)
    }

    async renameSession(sessionId: string, name: string): Promise<Session> {
        return await this.syncServices.sessionCache.renameSession(sessionId, name)
    }

    async spawnSession(
        options: SyncEngineSpawnSessionOptions
    ): Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }> {
        return await this.syncServices.sessionRpcFacade.spawnSession(options)
    }

    async ingestRuntimeEvent(event: ProviderAdapterRuntimeEvent) {
        return await this.syncServices.runtimeEventIngestor.ingest(event)
    }

    async resumeSession(
        sessionId: string,
        opts?: { permissionMode?: Session['permissionMode'] }
    ): Promise<SessionCommandResumeResult> {
        const result = await this.executeSessionCommand({
            type: 'resume',
            sessionId,
            permissionMode: opts?.permissionMode,
        })
        if (result.ok) {
            return result.resume ?? { type: 'error', message: 'Session resume failed', code: 'session_action_failed' }
        }
        return { type: 'error', message: result.error.message, code: result.error.code }
    }

    async checkPathsExist(machineId: string, paths: string[]): Promise<Record<string, boolean>> {
        return await this.syncServices.sessionRpcFacade.checkPathsExist(machineId, paths)
    }

    async browseMachineDirectory(machineId: string, path?: string, options?: { workspaceRoot?: string }) {
        return await this.syncServices.sessionRpcFacade.browseMachineDirectory(machineId, path, options)
    }

    async resolveAgentLaunchConfig(machineId: string, request: ResolveAgentLaunchConfigRequest) {
        return await this.syncServices.runtimeCapabilityCache.resolveAgentLaunchConfig(machineId, request)
    }

    async getAgentLaunchOptions(machineId: string, request: { directory?: string; refresh?: boolean }) {
        return await this.syncServices.runtimeCapabilityCache.getAgentLaunchOptions(machineId, request)
    }

    getRuntimeCapabilitySnapshot(machineId: string, request: RuntimeCapabilityRequest): RuntimeCapabilitySnapshot {
        return this.syncServices.runtimeCapabilityCache.getSnapshot(machineId, request)
    }

    async listAgentAvailability(machineId: string, request: ListAgentAvailabilityRequest) {
        return await this.syncServices.runtimeCapabilityCache.getAgentAvailability(machineId, request)
    }

    async loadAgentConfigFiles(machineId: string) {
        return await this.syncServices.sessionRpcFacade.loadAgentConfigFiles(machineId)
    }

    async saveAgentConfigFile(machineId: string, request: SaveAgentConfigRequest) {
        return await this.syncServices.sessionRpcFacade.saveAgentConfigFile(machineId, request)
    }

    async restoreAgentConfigFile(machineId: string, request: RestoreAgentConfigRequest) {
        return await this.syncServices.sessionRpcFacade.restoreAgentConfigFile(machineId, request)
    }

    async openAgentConfigFile(machineId: string, request: OpenAgentConfigRequest) {
        return await this.syncServices.sessionRpcFacade.openAgentConfigFile(machineId, request)
    }

    async validateRuntimeSpawnCapability(machineId: string, options: RuntimeSpawnValidationOptions) {
        return await this.syncServices.runtimeCapabilityCache.validateSpawn(machineId, options)
    }

    async listLocalSessions(machineId: string, request: LocalSessionCatalogRequest) {
        return await this.syncServices.localSessionRecoveryService.listLocalSessions(machineId, request)
    }

    async importLocalSession(machineId: string, request: LocalSessionExportRequest) {
        const machine = this.getMachine(machineId)
        if (!machine) {
            throw new Error('Local runtime unavailable')
        }

        return await this.syncServices.localSessionRecoveryService.importLocalSession(machine, request)
    }

    async getGitStatus(sessionId: string, cwd?: string) {
        return await this.syncServices.sessionRpcFacade.getGitStatus(sessionId, cwd)
    }

    async getGitDiffNumstat(sessionId: string, options: { cwd?: string; staged?: boolean }) {
        return await this.syncServices.sessionRpcFacade.getGitDiffNumstat(sessionId, options)
    }

    async getGitDiffFile(sessionId: string, options: { cwd?: string; filePath: string; staged?: boolean }) {
        return await this.syncServices.sessionRpcFacade.getGitDiffFile(sessionId, options)
    }

    async readSessionFile(sessionId: string, path: string) {
        return await this.syncServices.sessionRpcFacade.readSessionFile(sessionId, path)
    }

    async listDirectory(sessionId: string, path: string) {
        return await this.syncServices.sessionRpcFacade.listDirectory(sessionId, path)
    }

    async uploadFile(sessionId: string, filename: string, content: string, mimeType: string) {
        return await this.syncServices.sessionInteractionService.uploadFile(sessionId, filename, content, mimeType)
    }

    async deleteUploadFile(sessionId: string, path: string) {
        return await this.syncServices.sessionInteractionService.deleteUploadFile(sessionId, path)
    }

    async runRipgrep(sessionId: string, args: string[], cwd?: string) {
        return await this.syncServices.sessionRpcFacade.runRipgrep(sessionId, args, cwd)
    }

    async listCommandCapabilities(sessionId: string, agent: string, revision?: string) {
        return await this.syncServices.sessionRpcFacade.listCommandCapabilities(sessionId, agent, revision)
    }

    async ensureSessionDriver(
        sessionId: string,
        driver: AgentFlavor,
        options?: { model?: string | null; codexServiceTier?: Session['codexServiceTier'] }
    ): Promise<Session | null> {
        return await this.syncServices.sessionBootstrapConfigService.ensureSessionDriver(sessionId, driver, options)
    }

    protected async appendPassiveInternalUserMessage(
        sessionId: string,
        payload: InternalSessionMessagePayload
    ): Promise<Session> {
        return await this.syncServices.sessionInteractionService.appendPassiveInternalUserMessage(sessionId, payload)
    }

    protected buildResumeHooks(): Parameters<SyncEngineServices['sessionLifecycleService']['resumeSession']>[1] {
        return {
            cleanupFailedResumeSpawn: async (originalSessionId, spawnedSessionId, resumeToken) =>
                await this.cleanupFailedResumeSpawn(originalSessionId, spawnedSessionId, resumeToken),
            waitForResumedSessionContract: async (sessionId, resumeToken, timeoutMs) =>
                await this.waitForResumedSessionContract(sessionId, resumeToken, timeoutMs),
            writeSessionResumeToken: async (sessionId, token) => {
                await this.writeSessionResumeToken(sessionId, token)
            },
            buildSessionHandoff: (sessionId) => this.buildSessionHandoff(sessionId),
        }
    }

    protected async cleanupFailedResumeSpawn(
        originalSessionId: string,
        spawnedSessionId: string,
        resumeToken: string
    ): Promise<string | null> {
        return await this.syncServices.sessionLifecycleService.defaultCleanupFailedResumeSpawn(
            originalSessionId,
            spawnedSessionId,
            resumeToken
        )
    }

    protected async waitForResumedSessionContract(
        sessionId: string,
        resumeToken: string,
        timeoutMs?: number
    ): Promise<ResumeContractState> {
        return await this.syncServices.sessionLifecycleService.defaultWaitForResumedSessionContract(
            sessionId,
            resumeToken,
            timeoutMs
        )
    }

    protected async writeSessionResumeToken(sessionId: string, token: string | undefined): Promise<void> {
        await this.syncServices.sessionLifecycleService.defaultWriteSessionResumeToken(sessionId, token)
    }
}
