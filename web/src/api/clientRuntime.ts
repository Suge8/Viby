import type {
    AgentConfigResponse,
    AgentFlavor,
    AgentLaunchOptionsResponse,
    CodexCollaborationMode,
    CodexServiceTier,
    LocalSessionExportRequest,
    ModelReasoningEffort,
    OpenAgentConfigRequest,
    OpenAgentConfigResponse,
    PermissionMode,
    RestoreAgentConfigRequest,
    RestoreAgentConfigResponse,
    RuntimeBrowseDirectoryResponse,
    RuntimeCapabilityRequest,
    RuntimeCapabilityResponse,
    RuntimeImportLocalSessionResponse,
    RuntimeLocalSessionsResponse,
    RuntimePathsExistsResponse,
    RuntimeResponse,
    SaveAgentConfigRequest,
    SaveAgentConfigResponse,
    Session,
    SpawnResponse,
} from '@/types/api'
import type { ApiClientRequest } from './client'

type RecoverLocalDriver = LocalSessionExportRequest['driver']

type SpawnErrorResponse = {
    type: 'error'
    message: string
}

type SpawnSuccessResponse = {
    type: 'success'
    session: Session
}

const SPAWN_SESSION_REQUEST_TIMEOUT_MS = 25_000

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isSession(value: unknown): value is Session {
    return isRecord(value) && typeof value.id === 'string'
}

function isSpawnErrorResponse(value: unknown): value is SpawnErrorResponse {
    return isRecord(value) && value.type === 'error' && typeof value.message === 'string'
}

function isSpawnSuccessResponse(value: unknown): value is SpawnSuccessResponse {
    return isRecord(value) && value.type === 'success' && isSession(value.session)
}

export async function getRuntime(request: ApiClientRequest): Promise<RuntimeResponse> {
    return await request<RuntimeResponse>('/api/runtime')
}

function appendRuntimeCapabilityParams(params: URLSearchParams, input?: RuntimeCapabilityRequest): void {
    if (input?.directory) params.set('directory', input.directory)
    if (input?.forceRefresh) params.set('forceRefresh', 'true')
    if (input?.drivers?.length) params.set('drivers', input.drivers.join(','))
    if (input?.depth) params.set('depth', input.depth)
}

export async function getRuntimeCapabilities(
    request: ApiClientRequest,
    input?: RuntimeCapabilityRequest & { signal?: AbortSignal }
): Promise<RuntimeCapabilityResponse> {
    const params = new URLSearchParams()
    appendRuntimeCapabilityParams(params, input)
    const queryString = params.toString()
    return await request<RuntimeCapabilityResponse>(
        `/api/runtime/capabilities${queryString ? `?${queryString}` : ''}`,
        {
            signal: input?.signal,
        }
    )
}

export async function getAgentLaunchOptions(
    request: ApiClientRequest,
    input?: { directory?: string; refresh?: boolean; signal?: AbortSignal }
): Promise<AgentLaunchOptionsResponse> {
    const params = new URLSearchParams()
    if (input?.directory) params.set('directory', input.directory)
    if (input?.refresh) params.set('refresh', '1')
    const queryString = params.toString()
    return await request<AgentLaunchOptionsResponse>(
        `/api/runtime/agent-launch-options${queryString ? `?${queryString}` : ''}`,
        { signal: input?.signal }
    )
}

export async function getAgentConfig(request: ApiClientRequest): Promise<AgentConfigResponse> {
    return await request<AgentConfigResponse>('/api/runtime/agent-config')
}

export async function saveAgentConfig(
    request: ApiClientRequest,
    input: SaveAgentConfigRequest
): Promise<SaveAgentConfigResponse> {
    return await request<SaveAgentConfigResponse>(`/api/runtime/agent-config/${encodeURIComponent(input.driver)}`, {
        method: 'PUT',
        body: JSON.stringify(input),
    })
}

export async function restoreAgentConfig(
    request: ApiClientRequest,
    input: RestoreAgentConfigRequest
): Promise<RestoreAgentConfigResponse> {
    return await request<RestoreAgentConfigResponse>(
        `/api/runtime/agent-config/${encodeURIComponent(input.driver)}/restore`,
        {
            method: 'POST',
            body: JSON.stringify(input),
        }
    )
}

export async function openAgentConfig(
    request: ApiClientRequest,
    input: OpenAgentConfigRequest
): Promise<OpenAgentConfigResponse> {
    return await request<OpenAgentConfigResponse>(
        `/api/runtime/agent-config/${encodeURIComponent(input.driver)}/open`,
        {
            method: 'POST',
            body: JSON.stringify(input),
        }
    )
}

export async function checkRuntimePathsExists(
    request: ApiClientRequest,
    paths: string[]
): Promise<RuntimePathsExistsResponse> {
    return await request<RuntimePathsExistsResponse>('/api/runtime/paths/exists', {
        method: 'POST',
        body: JSON.stringify({ paths }),
    })
}

export async function browseRuntimeDirectory(
    request: ApiClientRequest,
    path?: string,
    options?: { workspaceRoot?: string | null }
): Promise<RuntimeBrowseDirectoryResponse> {
    const params = new URLSearchParams()
    if (path) {
        params.set('path', path)
    }
    if (options?.workspaceRoot) {
        params.set('workspaceRoot', options.workspaceRoot)
    }

    const queryString = params.toString()
    return await request<RuntimeBrowseDirectoryResponse>(
        `/api/runtime/directory${queryString ? `?${queryString}` : ''}`
    )
}

export async function listRuntimeLocalSessions(
    request: ApiClientRequest,
    path: string,
    driver: RecoverLocalDriver,
    options?: { signal?: AbortSignal }
): Promise<RuntimeLocalSessionsResponse> {
    const params = new URLSearchParams()
    params.set('path', path)
    params.set('driver', driver)
    return await request<RuntimeLocalSessionsResponse>(`/api/runtime/local-sessions?${params.toString()}`, {
        signal: options?.signal,
    })
}

export async function importRuntimeLocalSession(
    request: ApiClientRequest,
    input: LocalSessionExportRequest
): Promise<RuntimeImportLocalSessionResponse> {
    return await request<RuntimeImportLocalSessionResponse>('/api/runtime/local-sessions/import', {
        method: 'POST',
        body: JSON.stringify(input),
    })
}

export async function spawnSession(
    request: ApiClientRequest,
    input: {
        directory: string
        agent?: AgentFlavor
        model?: string
        modelReasoningEffort?: ModelReasoningEffort
        codexServiceTier?: CodexServiceTier
        permissionMode?: PermissionMode
        sessionType?: 'simple' | 'worktree'
        worktreeName?: string
        collaborationMode?: CodexCollaborationMode
    }
): Promise<SpawnResponse> {
    const response = await request<unknown>('/api/runtime/spawn', {
        method: 'POST',
        body: JSON.stringify({
            directory: input.directory,
            agent: input.agent,
            model: input.model,
            modelReasoningEffort: input.modelReasoningEffort,
            codexServiceTier: input.codexServiceTier,
            permissionMode: input.permissionMode,
            sessionType: input.sessionType,
            worktreeName: input.worktreeName,
            collaborationMode: input.collaborationMode,
        }),
        // Keep Web's budget slightly above the AppCore child runtime.session-started wait.
        timeoutMs: SPAWN_SESSION_REQUEST_TIMEOUT_MS,
    })

    if (isSpawnErrorResponse(response)) {
        return response
    }
    if (isSpawnSuccessResponse(response)) {
        return response
    }
    throw new Error('Invalid spawn session response')
}
