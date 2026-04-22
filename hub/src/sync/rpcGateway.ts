import type {
    AgentAvailabilityResponse,
    AgentFlavor,
    CodexCollaborationMode,
    ListAgentAvailabilityRequest,
    LocalSessionCatalog,
    LocalSessionCatalogRequest,
    LocalSessionExportRequest,
    LocalSessionExportSnapshot,
    MachineDirectoryResponse,
    ModelReasoningEffort,
    PermissionMode,
    ResolveAgentLaunchConfigRequest,
    ResolveAgentLaunchConfigResponse,
    SessionDriver,
    SessionHandoffSnapshot,
} from '@viby/protocol/types'
import type { Server } from 'socket.io'
import type { RpcRegistry } from '../socket/rpcRegistry'
import { parseLocalSessionCatalogResponse, parseLocalSessionExportResponse } from './rpcGatewayLocalSessionSupport'
import {
    isMissingRpcHandler,
    parseAgentAvailabilityResponse,
    parseMachineDirectoryResponse,
    parsePathExistsResponse,
    parseResolveAgentLaunchConfigResponse,
    parseSpawnSessionResult,
} from './rpcGatewaySupport'
import type {
    RpcCommandResponse,
    RpcDeleteUploadResponse,
    RpcListDirectoryResponse,
    RpcMachineDirectoryResponse,
    RpcPathExistsResponse,
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
    constructor(
        private readonly io: Server,
        private readonly rpcRegistry: RpcRegistry
    ) {}

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
        await this.sessionRpc(sessionId, 'permission', {
            id: requestId,
            approved: false,
            decision,
        })
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
            collaborationMode?: CodexCollaborationMode
        }
    ): Promise<unknown> {
        return await this.sessionRpc(sessionId, 'set-session-config', config)
    }

    async killSession(sessionId: string): Promise<void> {
        await this.sessionRpc(sessionId, 'killSession', {})
    }

    async spawnSession(options: {
        sessionId?: string
        machineId: string
        directory: string
        agent?: AgentFlavor
        model?: string
        modelReasoningEffort?: ModelReasoningEffort | null
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
        try {
            const result = await this.machineRpc(options.machineId, 'spawn-viby-session', {
                type: 'spawn-in-directory',
                sessionId: options.sessionId,
                directory: options.directory,
                agent: options.agent ?? 'claude',
                model: options.model,
                modelReasoningEffort: options.modelReasoningEffort,
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
        const result = (await this.machineRpc(machineId, 'path-exists', { paths })) as RpcPathExistsResponse | unknown
        return parsePathExistsResponse(result)
    }

    async browseMachineDirectory(machineId: string, path?: string): Promise<RpcMachineDirectoryResponse> {
        let result: MachineDirectoryResponse | unknown
        try {
            result = (await this.machineRpc(machineId, 'browse-directory', { path })) as
                | MachineDirectoryResponse
                | unknown
        } catch (error) {
            if (isMissingRpcHandler(error, machineId, 'browse-directory')) {
                return {
                    success: false,
                    entries: [],
                    roots: [],
                    error: 'Machine directory browsing is unavailable until the target Viby process reconnects with the latest capabilities.',
                }
            }
            throw error
        }
        return parseMachineDirectoryResponse(result)
    }

    async resolveAgentLaunchConfig(
        machineId: string,
        request: ResolveAgentLaunchConfigRequest
    ): Promise<ResolveAgentLaunchConfigResponse> {
        const result = (await this.machineRpc(machineId, 'resolve-agent-launch-config', request)) as
            | ResolveAgentLaunchConfigResponse
            | unknown
        return parseResolveAgentLaunchConfigResponse(result)
    }

    async listAgentAvailability(
        machineId: string,
        request: ListAgentAvailabilityRequest
    ): Promise<AgentAvailabilityResponse> {
        const result = (await this.machineRpc(machineId, 'list-agent-availability', request)) as
            | AgentAvailabilityResponse
            | unknown
        return parseAgentAvailabilityResponse(result)
    }

    async listLocalSessions(machineId: string, request: LocalSessionCatalogRequest): Promise<LocalSessionCatalog> {
        const response = (await this.machineRpc(machineId, 'list-local-sessions', request)) as
            | LocalSessionCatalog
            | unknown
        return parseLocalSessionCatalogResponse(response)
    }

    async exportLocalSession(
        machineId: string,
        request: LocalSessionExportRequest
    ): Promise<LocalSessionExportSnapshot> {
        const response = (await this.machineRpc(machineId, 'export-local-session', request)) as
            | LocalSessionExportSnapshot
            | unknown
        return parseLocalSessionExportResponse(response)
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

    async uploadMachineFile(
        machineId: string,
        sessionId: string,
        filename: string,
        content: string,
        mimeType: string
    ): Promise<RpcUploadFileResponse> {
        return (await this.machineRpc(machineId, 'uploadFile', {
            sessionId,
            filename,
            content,
            mimeType,
        })) as RpcUploadFileResponse
    }

    async deleteMachineUploadFile(
        machineId: string,
        sessionId: string,
        path: string
    ): Promise<RpcDeleteUploadResponse> {
        return (await this.machineRpc(machineId, 'deleteUpload', { sessionId, path })) as RpcDeleteUploadResponse
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
    private async sessionRpc(sessionId: string, method: string, params: unknown): Promise<unknown> {
        return await this.rpcCall(`${sessionId}:${method}`, params)
    }

    private async machineRpc(machineId: string, method: string, params: unknown): Promise<unknown> {
        return await this.rpcCall(`${machineId}:${method}`, params)
    }

    private async rpcCall(method: string, params: unknown): Promise<unknown> {
        const socketId = this.rpcRegistry.getSocketIdForMethod(method)
        if (!socketId) {
            throw new Error(`RPC handler not registered: ${method}`)
        }

        const socket = this.io.of('/cli').sockets.get(socketId)
        if (!socket) {
            throw new Error(`RPC socket disconnected: ${method}`)
        }

        const response = (await socket.timeout(30_000).emitWithAck('rpc-request', {
            method,
            params: JSON.stringify(params),
        })) as unknown

        if (typeof response !== 'string') {
            return response
        }

        try {
            return JSON.parse(response) as unknown
        } catch {
            return response
        }
    }
}
