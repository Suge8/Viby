import type {
    AgentAvailabilityResponse,
    AgentConfigFileState,
    AgentConfigResponse,
    AgentFlavor,
    CodexCollaborationMode,
    CodexServiceTier,
    ListAgentAvailabilityRequest,
    LocalSessionCatalog,
    LocalSessionCatalogRequest,
    LocalSessionExportRequest,
    LocalSessionExportSnapshot,
    MachineDirectoryResponse,
    ModelReasoningEffort,
    OpenAgentConfigRequest,
    OpenAgentConfigResponse,
    PermissionMode,
    ResolveAgentLaunchConfigRequest,
    ResolveAgentLaunchConfigResponse,
    RestoreAgentConfigRequest,
    SaveAgentConfigRequest,
    SessionDriver,
    SessionHandoffSnapshot,
} from '@viby/protocol/types'
import type { DirectRuntimeRegistry } from '../runtime/directRuntimeRegistry'
import { DirectRpcCaller } from './directRpcCaller'
import { MachineRpcGateway } from './rpcGatewayMachine'
import type {
    RpcCommandResponse,
    RpcDeleteUploadResponse,
    RpcListDirectoryResponse,
    RpcMachineDirectoryResponse,
    RpcReadFileResponse,
    RpcUploadFileResponse,
} from './rpcGatewayTypes'

export type {
    RpcCommandResponse,
    RpcDeleteUploadResponse,
    RpcListDirectoryResponse,
    RpcMachineDirectoryResponse,
    RpcPathExistsResponse,
    RpcReadFileResponse,
    RpcUploadFileResponse,
} from './rpcGatewayTypes'

export class RpcGateway {
    private readonly rpc: DirectRpcCaller
    private readonly machine: MachineRpcGateway

    constructor(directRuntimeRegistry: DirectRuntimeRegistry) {
        this.rpc = new DirectRpcCaller(directRuntimeRegistry)
        this.machine = new MachineRpcGateway(this.rpc)
    }

    async approvePermission(
        sessionId: string,
        requestId: string,
        mode?: PermissionMode,
        allowTools?: string[],
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
        answers?: Record<string, string[]> | Record<string, { answers: string[] }>
    ): Promise<void> {
        await this.sessionRpc(sessionId, 'permission', {
            id: requestId,
            approved: true,
            mode,
            allowTools,
            decision,
            answers,
        })
    }

    async denyPermission(
        sessionId: string,
        requestId: string,
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    ): Promise<void> {
        await this.sessionRpc(sessionId, 'permission', { id: requestId, approved: false, decision })
    }

    async abortSession(sessionId: string): Promise<void> {
        await this.sessionRpc(sessionId, 'abort', { reason: 'User aborted via hub' })
    }

    async requestSessionConfig(
        sessionId: string,
        config: {
            permissionMode?: PermissionMode
            model?: string | null
            modelReasoningEffort?: ModelReasoningEffort | null
            codexServiceTier?: CodexServiceTier | null
            collaborationMode?: CodexCollaborationMode
        }
    ): Promise<unknown> {
        return await this.sessionRpc(sessionId, 'set-session-config', config)
    }

    async killSession(sessionId: string): Promise<void> {
        await this.sessionRpc(sessionId, 'killSession', {}, 1_500)
    }

    async spawnSession(options: {
        sessionId?: string
        machineId: string
        directory: string
        agent?: AgentFlavor
        model?: string
        modelReasoningEffort?: ModelReasoningEffort | null
        codexServiceTier?: CodexServiceTier | null
        permissionMode?: PermissionMode
        sessionType?: 'simple' | 'worktree'
        worktreeName?: string
        resumeSessionId?: string
        collaborationMode?: CodexCollaborationMode
        driverSwitch?: { targetDriver: SessionDriver; handoffSnapshot: SessionHandoffSnapshot }
    }): Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }> {
        return await this.machine.spawnSession(options)
    }

    async checkPathsExist(machineId: string, paths: string[]): Promise<Record<string, boolean>> {
        return await this.machine.checkPathsExist(machineId, paths)
    }

    async browseMachineDirectory(
        machineId: string,
        path?: string,
        options?: { workspaceRoot?: string }
    ): Promise<RpcMachineDirectoryResponse> {
        return await this.machine.browseDirectory(machineId, path, options)
    }

    async resolveAgentLaunchConfig(
        machineId: string,
        request: ResolveAgentLaunchConfigRequest
    ): Promise<ResolveAgentLaunchConfigResponse> {
        return await this.machine.resolveAgentLaunchConfig(machineId, request)
    }

    async listAgentAvailability(
        machineId: string,
        request: ListAgentAvailabilityRequest
    ): Promise<AgentAvailabilityResponse> {
        return await this.machine.listAgentAvailability(machineId, request)
    }

    async loadAgentConfigFiles(machineId: string): Promise<AgentConfigResponse> {
        return await this.machine.loadAgentConfigFiles(machineId)
    }

    async saveAgentConfigFile(machineId: string, request: SaveAgentConfigRequest): Promise<AgentConfigFileState> {
        return await this.machine.saveAgentConfigFile(machineId, request)
    }

    async restoreAgentConfigFile(machineId: string, request: RestoreAgentConfigRequest): Promise<AgentConfigFileState> {
        return await this.machine.restoreAgentConfigFile(machineId, request)
    }

    async openAgentConfigFile(machineId: string, request: OpenAgentConfigRequest): Promise<OpenAgentConfigResponse> {
        return await this.machine.openAgentConfigFile(machineId, request)
    }

    async listLocalSessions(machineId: string, request: LocalSessionCatalogRequest): Promise<LocalSessionCatalog> {
        return await this.machine.listLocalSessions(machineId, request)
    }

    async exportLocalSession(
        machineId: string,
        request: LocalSessionExportRequest
    ): Promise<LocalSessionExportSnapshot> {
        return await this.machine.exportLocalSession(machineId, request)
    }

    async uploadMachineFile(
        machineId: string,
        sessionId: string,
        filename: string,
        content: string,
        mimeType: string
    ): Promise<RpcUploadFileResponse> {
        return await this.machine.uploadFile(machineId, sessionId, filename, content, mimeType)
    }

    async deleteMachineUploadFile(
        machineId: string,
        sessionId: string,
        path: string
    ): Promise<RpcDeleteUploadResponse> {
        return await this.machine.deleteUploadFile(machineId, sessionId, path)
    }

    async getGitStatus(sessionId: string, cwd?: string): Promise<RpcCommandResponse> {
        return (await this.sessionRpc(sessionId, 'git-status', { cwd })) as RpcCommandResponse
    }

    async getGitDiffNumstat(
        sessionId: string,
        options: { cwd?: string; staged?: boolean }
    ): Promise<RpcCommandResponse> {
        return (await this.sessionRpc(sessionId, 'git-diff-numstat', options)) as RpcCommandResponse
    }

    async getGitDiffFile(
        sessionId: string,
        options: { cwd?: string; filePath: string; staged?: boolean }
    ): Promise<RpcCommandResponse> {
        return (await this.sessionRpc(sessionId, 'git-diff-file', options)) as RpcCommandResponse
    }

    async readSessionFile(sessionId: string, path: string): Promise<RpcReadFileResponse> {
        return (await this.sessionRpc(sessionId, 'readFile', { path })) as RpcReadFileResponse
    }

    async listDirectory(sessionId: string, path: string): Promise<RpcListDirectoryResponse> {
        return (await this.sessionRpc(sessionId, 'listDirectory', { path })) as RpcListDirectoryResponse
    }

    async runRipgrep(sessionId: string, args: string[], cwd?: string): Promise<RpcCommandResponse> {
        return (await this.sessionRpc(sessionId, 'ripgrep', { args, cwd })) as RpcCommandResponse
    }

    async listCommandCapabilities(
        sessionId: string,
        agent: string,
        revision?: string
    ): Promise<import('@viby/protocol/types').CommandCapabilitiesResponse> {
        return (await this.sessionRpc(sessionId, 'listCommandCapabilities', {
            agent,
            revision,
        })) as import('@viby/protocol/types').CommandCapabilitiesResponse
    }

    private async sessionRpc(sessionId: string, method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
        return await this.rpc.session(sessionId, method, params, timeoutMs)
    }
}
