import type {
    AgentFlavor,
    CodexCollaborationMode,
    MachineDirectoryEntry,
    MachineDirectoryResponse,
    MachineDirectoryRoot,
    ModelReasoningEffort,
    PermissionMode,
    ResolveAgentLaunchConfigRequest,
    ResolveAgentLaunchConfigResponse,
    SessionHandoffSnapshot,
    TeamSessionSpawnRole,
    SessionDriver,
} from '@viby/protocol/types'
import type { Server } from 'socket.io'
import type { RpcRegistry } from '../socket/rpcRegistry'

export type RpcCommandResponse = {
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
}

export type RpcReadFileResponse = {
    success: boolean
    content?: string
    error?: string
}

export type RpcUploadFileResponse = {
    success: boolean
    path?: string
    error?: string
}

export type RpcDeleteUploadResponse = {
    success: boolean
    error?: string
}

export type RpcListDirectoryResponse = {
    success: boolean
    entries?: Array<{
        name: string
        type: 'file' | 'directory' | 'other'
        size?: number
        modified?: number
    }>
    error?: string
}

export type RpcMachineDirectoryResponse = {
    success: boolean
    currentPath?: string
    parentPath?: string | null
    entries?: MachineDirectoryEntry[]
    roots?: MachineDirectoryRoot[]
    error?: string
}

function isMissingRpcHandler(error: unknown, machineId: string, method: string): boolean {
    return error instanceof Error
        && error.message === `RPC handler not registered: ${machineId}:${method}`
}

export type RpcPathExistsResponse = {
    exists: Record<string, boolean>
}

export class RpcGateway {
    constructor(
        private readonly io: Server,
        private readonly rpcRegistry: RpcRegistry
    ) {
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
            answers
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
            decision
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
        sessionRole?: TeamSessionSpawnRole
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
            const result = await this.machineRpc(
                options.machineId,
                'spawn-viby-session',
                {
                    type: 'spawn-in-directory',
                    sessionId: options.sessionId,
                    directory: options.directory,
                    agent: options.agent ?? 'claude',
                    model: options.model,
                    modelReasoningEffort: options.modelReasoningEffort,
                    permissionMode: options.permissionMode,
                    sessionRole: options.sessionRole,
                    sessionType: options.sessionType,
                    worktreeName: options.worktreeName,
                    resumeSessionId: options.resumeSessionId,
                    collaborationMode: options.collaborationMode,
                    driverSwitch: options.driverSwitch
                }
            )
            if (result && typeof result === 'object') {
                const obj = result as Record<string, unknown>
                if (obj.type === 'success' && typeof obj.sessionId === 'string') {
                    return { type: 'success', sessionId: obj.sessionId }
                }
                if (obj.type === 'error' && typeof obj.errorMessage === 'string') {
                    return { type: 'error', message: obj.errorMessage }
                }
                if (obj.type === 'requestToApproveDirectoryCreation' && typeof obj.directory === 'string') {
                    return { type: 'error', message: `Directory creation requires approval: ${obj.directory}` }
                }
                if (typeof obj.error === 'string') {
                    return { type: 'error', message: obj.error }
                }
                if (obj.type !== 'success' && typeof obj.message === 'string') {
                    return { type: 'error', message: obj.message }
                }
            }
            const details = typeof result === 'string'
                ? result
                : (() => {
                    try {
                        return JSON.stringify(result)
                    } catch {
                        return String(result)
                    }
                })()
            return { type: 'error', message: `Unexpected spawn result: ${details}` }
        } catch (error) {
            return { type: 'error', message: error instanceof Error ? error.message : String(error) }
        }
    }

    async checkPathsExist(machineId: string, paths: string[]): Promise<Record<string, boolean>> {
        const result = await this.machineRpc(machineId, 'path-exists', { paths }) as RpcPathExistsResponse | unknown
        if (!result || typeof result !== 'object') {
            throw new Error('Unexpected path-exists result')
        }

        const existsValue = (result as RpcPathExistsResponse).exists
        if (!existsValue || typeof existsValue !== 'object') {
            throw new Error('Unexpected path-exists result')
        }

        const exists: Record<string, boolean> = {}
        for (const [key, value] of Object.entries(existsValue)) {
            exists[key] = value === true
        }
        return exists
    }

    async browseMachineDirectory(machineId: string, path?: string): Promise<RpcMachineDirectoryResponse> {
        let result: MachineDirectoryResponse | unknown
        try {
            result = await this.machineRpc(machineId, 'browse-directory', { path }) as MachineDirectoryResponse | unknown
        } catch (error) {
            if (isMissingRpcHandler(error, machineId, 'browse-directory')) {
                return {
                    success: false,
                    entries: [],
                    roots: [],
                    error: 'Machine directory browsing is unavailable until the target Viby process reconnects with the latest capabilities.'
                }
            }
            throw error
        }
        if (!result || typeof result !== 'object') {
            throw new Error('Unexpected browse-directory result')
        }

        const response = result as MachineDirectoryResponse
        return {
            success: response.success === true,
            currentPath: typeof response.currentPath === 'string' ? response.currentPath : undefined,
            parentPath: response.parentPath ?? null,
            entries: Array.isArray(response.entries) ? response.entries : [],
            roots: Array.isArray(response.roots) ? response.roots : [],
            error: typeof response.error === 'string' ? response.error : undefined
        }
    }

    async resolveAgentLaunchConfig(
        machineId: string,
        request: ResolveAgentLaunchConfigRequest
    ): Promise<ResolveAgentLaunchConfigResponse> {
        const result = await this.machineRpc(machineId, 'resolve-agent-launch-config', request) as ResolveAgentLaunchConfigResponse | unknown
        if (!result || typeof result !== 'object') {
            throw new Error('Unexpected resolve-agent-launch-config result')
        }

        if ((result as ResolveAgentLaunchConfigResponse).type === 'success') {
            return result as ResolveAgentLaunchConfigResponse
        }

        if ((result as ResolveAgentLaunchConfigResponse).type === 'error') {
            return result as ResolveAgentLaunchConfigResponse
        }

        throw new Error('Unexpected resolve-agent-launch-config result')
    }

    async getGitStatus(sessionId: string, cwd?: string): Promise<RpcCommandResponse> {
        return await this.sessionRpc(sessionId, 'git-status', { cwd }) as RpcCommandResponse
    }

    async getGitDiffNumstat(sessionId: string, options: { cwd?: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.sessionRpc(sessionId, 'git-diff-numstat', options) as RpcCommandResponse
    }

    async getGitDiffFile(sessionId: string, options: { cwd?: string; filePath: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.sessionRpc(sessionId, 'git-diff-file', options) as RpcCommandResponse
    }

    async readSessionFile(sessionId: string, path: string): Promise<RpcReadFileResponse> {
        return await this.sessionRpc(sessionId, 'readFile', { path }) as RpcReadFileResponse
    }

    async listDirectory(sessionId: string, path: string): Promise<RpcListDirectoryResponse> {
        return await this.sessionRpc(sessionId, 'listDirectory', { path }) as RpcListDirectoryResponse
    }

    async uploadFile(sessionId: string, filename: string, content: string, mimeType: string): Promise<RpcUploadFileResponse> {
        return await this.sessionRpc(sessionId, 'uploadFile', { sessionId, filename, content, mimeType }) as RpcUploadFileResponse
    }

    async deleteUploadFile(sessionId: string, path: string): Promise<RpcDeleteUploadResponse> {
        return await this.sessionRpc(sessionId, 'deleteUpload', { sessionId, path }) as RpcDeleteUploadResponse
    }

    async runRipgrep(sessionId: string, args: string[], cwd?: string): Promise<RpcCommandResponse> {
        return await this.sessionRpc(sessionId, 'ripgrep', { args, cwd }) as RpcCommandResponse
    }

    async listSlashCommands(sessionId: string, agent: string): Promise<{
        success: boolean
        commands?: Array<{ name: string; description?: string; source: 'builtin' | 'user' | 'plugin' | 'project' }>
        error?: string
    }> {
        return await this.sessionRpc(sessionId, 'listSlashCommands', { agent }) as {
            success: boolean
            commands?: Array<{ name: string; description?: string; source: 'builtin' | 'user' | 'plugin' | 'project' }>
            error?: string
        }
    }

    async listSkills(sessionId: string): Promise<{
        success: boolean
        skills?: Array<{ name: string; description?: string }>
        error?: string
    }> {
        return await this.sessionRpc(sessionId, 'listSkills', {}) as {
            success: boolean
            skills?: Array<{ name: string; description?: string }>
            error?: string
        }
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

        const response = await socket.timeout(30_000).emitWithAck('rpc-request', {
            method,
            params: JSON.stringify(params)
        }) as unknown

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
