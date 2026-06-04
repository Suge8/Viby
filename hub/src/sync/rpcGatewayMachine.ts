import type {
    AgentAvailabilityResponse,
    AgentConfigFileState,
    AgentConfigResponse,
    AgentFlavor,
    CodexCollaborationMode,
    CodexServiceTier,
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
import type { DirectRpcCaller } from './directRpcCaller'
import { parseLocalSessionCatalogResponse, parseLocalSessionExportResponse } from './rpcGatewayLocalSessionSupport'
import {
    isMissingRpcHandler,
    parseAgentAvailabilityResponse,
    parseAgentConfigFileState,
    parseAgentConfigResponse,
    parseMachineDirectoryResponse,
    parseOpenAgentConfigResponse,
    parsePathExistsResponse,
    parseResolveAgentLaunchConfigResponse,
    parseRestoreAgentConfigResponse,
    parseSpawnSessionResult,
} from './rpcGatewaySupport'
import type {
    RpcDeleteUploadResponse,
    RpcMachineDirectoryResponse,
    RpcPathExistsResponse,
    RpcUploadFileResponse,
} from './rpcGatewayTypes'

type SpawnSessionOptions = {
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
    driverSwitch?: {
        targetDriver: SessionDriver
        handoffSnapshot: SessionHandoffSnapshot
    }
}

export class MachineRpcGateway {
    constructor(private readonly rpc: DirectRpcCaller) {}

    async spawnSession(
        options: SpawnSessionOptions
    ): Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }> {
        try {
            const result = await this.rpc.machine(options.machineId, 'spawn-viby-session', {
                type: 'spawn-in-directory',
                sessionId: options.sessionId,
                directory: options.directory,
                agent: options.agent ?? 'claude',
                model: options.model,
                modelReasoningEffort: options.modelReasoningEffort,
                codexServiceTier: options.codexServiceTier ?? undefined,
                permissionMode: options.permissionMode,
                sessionType: options.sessionType,
                worktreeName: options.worktreeName,
                resumeSessionId: options.resumeSessionId,
                collaborationMode: options.collaborationMode,
                driverSwitch: options.driverSwitch,
            })
            return parseSpawnSessionResult(result)
        } catch (error) {
            return { type: 'error', message: error instanceof Error ? error.message : String(error) }
        }
    }

    async checkPathsExist(machineId: string, paths: string[]): Promise<Record<string, boolean>> {
        const result = (await this.rpc.machine(machineId, 'path-exists', { paths })) as RpcPathExistsResponse | unknown
        return parsePathExistsResponse(result)
    }

    async browseDirectory(
        machineId: string,
        path?: string,
        options?: { workspaceRoot?: string }
    ): Promise<RpcMachineDirectoryResponse> {
        try {
            const result = (await this.rpc.machine(machineId, 'browse-directory', {
                path,
                workspaceRoot: options?.workspaceRoot,
            })) as MachineDirectoryResponse | unknown
            return parseMachineDirectoryResponse(result)
        } catch (error) {
            if (!isMissingRpcHandler(error, machineId, 'browse-directory')) throw error
            return {
                success: false,
                entries: [],
                roots: [],
                error: 'Machine directory browsing is unavailable until the target Viby process reconnects with the latest capabilities.',
            }
        }
    }

    async resolveAgentLaunchConfig(
        machineId: string,
        request: ResolveAgentLaunchConfigRequest
    ): Promise<ResolveAgentLaunchConfigResponse> {
        const result = (await this.rpc.machine(machineId, 'resolve-agent-launch-config', request)) as
            | ResolveAgentLaunchConfigResponse
            | unknown
        return parseResolveAgentLaunchConfigResponse(result)
    }

    async listAgentAvailability(machineId: string, request: unknown): Promise<AgentAvailabilityResponse> {
        const result = (await this.rpc.machine(machineId, 'list-agent-availability', request)) as
            | AgentAvailabilityResponse
            | unknown
        return parseAgentAvailabilityResponse(result)
    }

    async loadAgentConfigFiles(machineId: string): Promise<AgentConfigResponse> {
        const result = (await this.rpc.machine(machineId, 'load-agent-config-files', {})) as
            | AgentConfigResponse
            | unknown
        return parseAgentConfigResponse(result)
    }

    async saveAgentConfigFile(machineId: string, request: SaveAgentConfigRequest): Promise<AgentConfigFileState> {
        const result = (await this.rpc.machine(machineId, 'save-agent-config-file', request)) as
            | AgentConfigFileState
            | unknown
        return parseAgentConfigFileState(result)
    }

    async restoreAgentConfigFile(machineId: string, request: RestoreAgentConfigRequest): Promise<AgentConfigFileState> {
        const result = (await this.rpc.machine(machineId, 'restore-agent-config-file', request)) as
            | AgentConfigFileState
            | unknown
        return parseRestoreAgentConfigResponse(result)
    }

    async openAgentConfigFile(machineId: string, request: OpenAgentConfigRequest): Promise<OpenAgentConfigResponse> {
        const result = (await this.rpc.machine(machineId, 'open-agent-config-file', request)) as
            | OpenAgentConfigResponse
            | unknown
        return parseOpenAgentConfigResponse(result)
    }

    async listLocalSessions(machineId: string, request: LocalSessionCatalogRequest): Promise<LocalSessionCatalog> {
        const response = (await this.rpc.machine(machineId, 'list-local-sessions', request)) as
            | LocalSessionCatalog
            | unknown
        return parseLocalSessionCatalogResponse(response)
    }

    async exportLocalSession(
        machineId: string,
        request: LocalSessionExportRequest
    ): Promise<LocalSessionExportSnapshot> {
        const response = (await this.rpc.machine(machineId, 'export-local-session', request)) as
            | LocalSessionExportSnapshot
            | unknown
        return parseLocalSessionExportResponse(response)
    }

    async uploadFile(
        machineId: string,
        sessionId: string,
        filename: string,
        content: string,
        mimeType: string
    ): Promise<RpcUploadFileResponse> {
        return (await this.rpc.machine(machineId, 'uploadFile', {
            sessionId,
            filename,
            content,
            mimeType,
        })) as RpcUploadFileResponse
    }

    async deleteUploadFile(machineId: string, sessionId: string, path: string): Promise<RpcDeleteUploadResponse> {
        return (await this.rpc.machine(machineId, 'deleteUpload', { sessionId, path })) as RpcDeleteUploadResponse
    }
}
