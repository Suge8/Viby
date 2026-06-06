import type {
    AgentFlavor,
    CodexCollaborationMode,
    CodexServiceTier,
    LocalSessionExportRequest,
    ModelReasoningEffort,
    OpenAgentConfigRequest,
    PermissionMode,
    RestoreAgentConfigRequest,
    RuntimeCapabilityRequest,
    SaveAgentConfigRequest,
} from '@/types/api'
import type { ApiClientRequest } from './client'
import {
    browseRuntimeDirectory,
    checkRuntimePathsExists,
    getAgentConfig,
    getAgentLaunchOptions,
    getRuntime,
    getRuntimeCapabilities,
    importRuntimeLocalSession,
    listRuntimeLocalSessions,
    openAgentConfig,
    restoreAgentConfig,
    saveAgentConfig,
    spawnSession,
} from './clientRuntime'

export function createApiClientRuntimeMethods(request: ApiClientRequest) {
    return {
        async getRuntime() {
            return await getRuntime(request)
        },
        async getRuntimeCapabilities(input?: RuntimeCapabilityRequest & { signal?: AbortSignal }) {
            return await getRuntimeCapabilities(request, input)
        },
        async getAgentLaunchOptions(input?: { directory?: string; refresh?: boolean; signal?: AbortSignal }) {
            return await getAgentLaunchOptions(request, input)
        },
        async getAgentConfig() {
            return await getAgentConfig(request)
        },
        async saveAgentConfig(input: SaveAgentConfigRequest) {
            return await saveAgentConfig(request, input)
        },
        async restoreAgentConfig(input: RestoreAgentConfigRequest) {
            return await restoreAgentConfig(request, input)
        },
        async openAgentConfig(input: OpenAgentConfigRequest) {
            return await openAgentConfig(request, input)
        },
        async checkRuntimePathsExists(paths: string[]) {
            return await checkRuntimePathsExists(request, paths)
        },
        async browseRuntimeDirectory(path?: string, options?: { workspaceRoot?: string | null }) {
            return await browseRuntimeDirectory(request, path, options)
        },
        async listRuntimeLocalSessions(
            path: string,
            driver: LocalSessionExportRequest['driver'],
            options?: { signal?: AbortSignal }
        ) {
            return await listRuntimeLocalSessions(request, path, driver, options)
        },
        async importRuntimeLocalSession(input: LocalSessionExportRequest) {
            return await importRuntimeLocalSession(request, input)
        },
        async spawnSession(input: {
            directory: string
            agent?: AgentFlavor
            model?: string
            modelReasoningEffort?: ModelReasoningEffort
            codexServiceTier?: CodexServiceTier
            permissionMode?: PermissionMode
            sessionType?: 'simple' | 'worktree'
            worktreeName?: string
            collaborationMode?: CodexCollaborationMode
        }) {
            return await spawnSession(request, input)
        },
    }
}
