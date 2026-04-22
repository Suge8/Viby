import type { SessionDriver, SessionHandoffSnapshot } from '@viby/protocol'
import type {
    AgentAvailabilityResponse,
    AgentFlavor,
    CodexCollaborationMode,
    ListAgentAvailabilityRequest,
    LocalSessionCatalog,
    LocalSessionCatalogRequest,
    LocalSessionExportRequest,
    LocalSessionExportSnapshot,
    PermissionMode,
    ResolveAgentLaunchConfigRequest,
    ResolveAgentLaunchConfigResponse,
    Session,
} from '@viby/protocol/types'
import {
    type RpcCommandResponse,
    type RpcDeleteUploadResponse,
    RpcGateway,
    type RpcListDirectoryResponse,
    type RpcMachineDirectoryResponse,
    type RpcPathExistsResponse,
    type RpcReadFileResponse,
    type RpcUploadFileResponse,
} from './rpcGateway'
import type { SessionConfigPatch } from './sessionPayloadTypes'

type ApplySessionConfig = (sessionId: string, config: SessionConfigPatch) => void

function isAppliedSessionConfigShape(value: unknown): value is { applied: SessionConfigPatch } {
    return (
        typeof value === 'object' &&
        value !== null &&
        'applied' in value &&
        typeof (value as { applied?: unknown }).applied === 'object' &&
        (value as { applied?: unknown }).applied !== null
    )
}

export class SessionRpcFacade {
    constructor(
        private readonly rpcGateway: RpcGateway,
        private readonly applySessionConfig: ApplySessionConfig
    ) {}

    async approvePermission(
        sessionId: string,
        requestId: string,
        mode?: PermissionMode,
        allowTools?: string[],
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
        answers?: Record<string, string[]> | Record<string, { answers: string[] }>
    ): Promise<void> {
        await this.rpcGateway.approvePermission(sessionId, requestId, mode, allowTools, decision, answers)
    }

    async denyPermission(
        sessionId: string,
        requestId: string,
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    ): Promise<void> {
        await this.rpcGateway.denyPermission(sessionId, requestId, decision)
    }

    async requestSessionConfig(sessionId: string, config: SessionConfigPatch): Promise<void> {
        const result = await this.rpcGateway.requestSessionConfig(sessionId, config)
        if (!isAppliedSessionConfigShape(result)) {
            throw new Error('Missing applied session config')
        }

        this.applySessionConfig(sessionId, result.applied)
    }

    async spawnSession(options: {
        sessionId?: string
        machineId: string
        directory: string
        agent?: AgentFlavor
        model?: string
        modelReasoningEffort?: Session['modelReasoningEffort']
        permissionMode?: PermissionMode
        sessionType?: 'simple' | 'worktree'
        worktreeName?: string
        resumeSessionId?: string
        collaborationMode?: CodexCollaborationMode
        driverSwitch?: {
            targetDriver: SessionDriver
            handoffSnapshot: SessionHandoffSnapshot
        }
    }): Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }> {
        return await this.rpcGateway.spawnSession(options)
    }

    async checkPathsExist(machineId: string, paths: string[]): Promise<Record<string, boolean>> {
        return await this.rpcGateway.checkPathsExist(machineId, paths)
    }

    async browseMachineDirectory(machineId: string, path?: string): Promise<RpcMachineDirectoryResponse> {
        return await this.rpcGateway.browseMachineDirectory(machineId, path)
    }

    async resolveAgentLaunchConfig(
        machineId: string,
        request: ResolveAgentLaunchConfigRequest
    ): Promise<ResolveAgentLaunchConfigResponse> {
        return await this.rpcGateway.resolveAgentLaunchConfig(machineId, request)
    }

    async listAgentAvailability(
        machineId: string,
        request: ListAgentAvailabilityRequest
    ): Promise<AgentAvailabilityResponse> {
        return await this.rpcGateway.listAgentAvailability(machineId, request)
    }

    async listLocalSessions(machineId: string, request: LocalSessionCatalogRequest): Promise<LocalSessionCatalog> {
        return await this.rpcGateway.listLocalSessions(machineId, request)
    }

    async exportLocalSession(
        machineId: string,
        request: LocalSessionExportRequest
    ): Promise<LocalSessionExportSnapshot> {
        return await this.rpcGateway.exportLocalSession(machineId, request)
    }

    async getGitStatus(sessionId: string, cwd?: string): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitStatus(sessionId, cwd)
    }

    async getGitDiffNumstat(
        sessionId: string,
        options: { cwd?: string; staged?: boolean }
    ): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitDiffNumstat(sessionId, options)
    }

    async getGitDiffFile(
        sessionId: string,
        options: { cwd?: string; filePath: string; staged?: boolean }
    ): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitDiffFile(sessionId, options)
    }

    async readSessionFile(sessionId: string, path: string): Promise<RpcReadFileResponse> {
        return await this.rpcGateway.readSessionFile(sessionId, path)
    }

    async listDirectory(sessionId: string, path: string): Promise<RpcListDirectoryResponse> {
        return await this.rpcGateway.listDirectory(sessionId, path)
    }

    async uploadFile(
        machineId: string,
        sessionId: string,
        filename: string,
        content: string,
        mimeType: string
    ): Promise<RpcUploadFileResponse> {
        return await this.rpcGateway.uploadMachineFile(machineId, sessionId, filename, content, mimeType)
    }

    async deleteUploadFile(machineId: string, sessionId: string, path: string): Promise<RpcDeleteUploadResponse> {
        return await this.rpcGateway.deleteMachineUploadFile(machineId, sessionId, path)
    }

    async runRipgrep(sessionId: string, args: string[], cwd?: string): Promise<RpcCommandResponse> {
        return await this.rpcGateway.runRipgrep(sessionId, args, cwd)
    }

    async listCommandCapabilities(
        sessionId: string,
        agent: string,
        revision?: string
    ): Promise<import('@viby/protocol/types').CommandCapabilitiesResponse> {
        return await this.rpcGateway.listCommandCapabilities(sessionId, agent, revision)
    }
}
