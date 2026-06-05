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
import type { SessionCommandResumeResult } from './sessionCommandService'
import type { DriverSwitchResult, ResumeContractState } from './sessionLifecycleService'
import type {
    InternalSessionMessagePayload,
    SessionConfigPatch,
    SessionSendMessagePayload,
} from './sessionPayloadTypes'
import { SyncEngineReadApi } from './syncEngineReadApi'
import type { SyncEngineServices } from './syncEngineServiceFactory'

export type SyncEngineSpawnSessionOptions = Parameters<SyncEngineServices['sessionRpcFacade']['spawnSession']>[0]

export abstract class SyncEngineSessionApi extends SyncEngineReadApi {
    protected abstract get syncServices(): SyncEngineServices

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

    async abortSession(sessionId: string): Promise<Session> {
        return await this.syncServices.sessionCommandService.abortSession(sessionId)
    }

    async closeSession(sessionId: string): Promise<Session> {
        return await this.syncServices.sessionCommandService.closeSession(sessionId)
    }

    async archiveSession(sessionId: string): Promise<Session> {
        return await this.syncServices.sessionCommandService.archiveSession(sessionId)
    }

    async unarchiveSession(sessionId: string): Promise<Session> {
        return await this.syncServices.sessionCommandService.unarchiveSession(sessionId)
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.syncServices.sessionCache.deleteSession(sessionId)
    }

    async switchSessionDriver(sessionId: string, targetDriver: AgentFlavor): Promise<DriverSwitchResult> {
        const previousDriver = resolveSessionDriver(this.getSession(sessionId)?.metadata)
        const result = await this.syncServices.sessionCommandService.switchSessionDriver(sessionId, targetDriver, {
            buildSessionHandoff: (targetSessionId) => this.buildSessionHandoff(targetSessionId),
        })
        if (result.type !== 'success') {
            return result
        }

        if (!previousDriver || previousDriver === result.targetDriver) {
            return result
        }

        try {
            await this.syncServices.messageService.appendDriverSwitchedEvent(sessionId, {
                type: 'driver-switched',
                previousDriver,
                targetDriver: result.targetDriver,
            })
            return result
        } catch (error) {
            return {
                type: 'error',
                message: error instanceof Error ? error.message : 'Failed to append driver switch marker',
                code: 'marker_append_failed',
                stage: 'marker_append',
                status: 500,
                targetDriver: result.targetDriver,
                rollbackResult: 'not_needed',
                session: this.getSession(sessionId) ?? result.session,
            }
        }
    }

    async renameSession(sessionId: string, name: string): Promise<Session> {
        return await this.syncServices.sessionCache.renameSession(sessionId, name)
    }

    async applySessionConfig(sessionId: string, config: SessionConfigPatch): Promise<void> {
        await this.syncServices.sessionCommandService.applySessionConfig(sessionId, config)
    }

    async setPermissionMode(sessionId: string, mode: NonNullable<Session['permissionMode']>): Promise<Session> {
        return await this.syncServices.sessionCommandService.setPermissionMode(sessionId, mode)
    }

    async setCollaborationMode(sessionId: string, mode: NonNullable<Session['collaborationMode']>): Promise<Session> {
        return await this.syncServices.sessionCommandService.setCollaborationMode(sessionId, mode)
    }

    async setModel(sessionId: string, model: Session['model']): Promise<Session> {
        return await this.syncServices.sessionCommandService.setModel(sessionId, model)
    }

    async setModelReasoningEffort(
        sessionId: string,
        modelReasoningEffort: Session['modelReasoningEffort']
    ): Promise<Session> {
        return await this.syncServices.sessionCommandService.setModelReasoningEffort(sessionId, modelReasoningEffort)
    }

    async setCodexServiceTier(sessionId: string, codexServiceTier: Session['codexServiceTier']): Promise<Session> {
        return await this.syncServices.sessionCommandService.setCodexServiceTier(sessionId, codexServiceTier)
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
        return await this.syncServices.sessionCommandService.resumeSession(sessionId, this.buildResumeHooks(), opts)
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
