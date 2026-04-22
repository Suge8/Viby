import type {
    AgentFlavor,
    CodexCollaborationMode,
    LocalSessionExportRequest,
    ModelReasoningEffort,
    PermissionMode,
} from '@/types/api'
import type { ApiClientFetchSessionSnapshot, ApiClientRequest } from './client'
import {
    browseRuntimeDirectory,
    checkRuntimePathsExists,
    getRuntime,
    getRuntimeAgentAvailability,
    importRuntimeLocalSession,
    listRuntimeLocalSessions,
    resolveAgentLaunchConfig,
    spawnSession,
} from './clientRuntime'

export function createApiClientRuntimeMethods(
    request: ApiClientRequest,
    fetchSessionSnapshot: ApiClientFetchSessionSnapshot
) {
    return {
        async getRuntime() {
            return await getRuntime(request)
        },
        async getRuntimeAgentAvailability(input?: {
            directory?: string
            forceRefresh?: boolean
            signal?: AbortSignal
        }) {
            return await getRuntimeAgentAvailability(request, input)
        },
        async checkRuntimePathsExists(paths: string[]) {
            return await checkRuntimePathsExists(request, paths)
        },
        async browseRuntimeDirectory(path?: string) {
            return await browseRuntimeDirectory(request, path)
        },
        async resolveAgentLaunchConfig(input: { agent: AgentFlavor; directory: string }) {
            return await resolveAgentLaunchConfig(request, input)
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
            permissionMode?: PermissionMode
            sessionType?: 'simple' | 'worktree'
            worktreeName?: string
            collaborationMode?: CodexCollaborationMode
        }) {
            return await spawnSession(request, fetchSessionSnapshot, input)
        },
    }
}
