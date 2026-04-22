import type {
    AgentAvailabilityResponse,
    AgentFlavor,
    AgentLaunchConfigResponse,
    CodexCollaborationMode,
    LocalSessionExportRequest,
    ModelReasoningEffort,
    PermissionMode,
    RuntimeBrowseDirectoryResponse,
    RuntimeImportLocalSessionResponse,
    RuntimeLocalSessionsResponse,
    RuntimePathsExistsResponse,
    RuntimeResponse,
    Session,
    SpawnResponse,
} from '@/types/api'
import type { ApiClientFetchSessionSnapshot, ApiClientRequest } from './client'

type RecoverLocalDriver = LocalSessionExportRequest['driver']

type SpawnErrorResponse = {
    type: 'error'
    message: string
}

type SpawnSuccessResponse = {
    type: 'success'
    session: Session
}

const SPAWN_SESSION_REQUEST_TIMEOUT_MS = 20_000

type SpawnLegacySuccessResponse = {
    type: 'success'
    sessionId: string
}

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

function isSpawnLegacySuccessResponse(value: unknown): value is SpawnLegacySuccessResponse {
    return isRecord(value) && value.type === 'success' && typeof value.sessionId === 'string'
}

export async function getRuntime(request: ApiClientRequest): Promise<RuntimeResponse> {
    return await request<RuntimeResponse>('/api/runtime')
}

export async function getRuntimeAgentAvailability(
    request: ApiClientRequest,
    input?: { directory?: string; forceRefresh?: boolean; signal?: AbortSignal }
): Promise<AgentAvailabilityResponse> {
    const params = new URLSearchParams()
    if (input?.directory) {
        params.set('directory', input.directory)
    }
    if (input?.forceRefresh) {
        params.set('forceRefresh', 'true')
    }

    const queryString = params.toString()
    return await request<AgentAvailabilityResponse>(
        `/api/runtime/agent-availability${queryString ? `?${queryString}` : ''}`,
        {
            signal: input?.signal,
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
    path?: string
): Promise<RuntimeBrowseDirectoryResponse> {
    const params = new URLSearchParams()
    if (path) {
        params.set('path', path)
    }

    const queryString = params.toString()
    return await request<RuntimeBrowseDirectoryResponse>(
        `/api/runtime/directory${queryString ? `?${queryString}` : ''}`
    )
}

export async function resolveAgentLaunchConfig(
    request: ApiClientRequest,
    input: {
        agent: AgentFlavor
        directory: string
    }
): Promise<AgentLaunchConfigResponse> {
    return await request<AgentLaunchConfigResponse>('/api/runtime/agent-launch-config', {
        method: 'POST',
        body: JSON.stringify(input),
    })
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
    fetchSessionSnapshot: ApiClientFetchSessionSnapshot,
    input: {
        directory: string
        agent?: AgentFlavor
        model?: string
        modelReasoningEffort?: ModelReasoningEffort
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
            permissionMode: input.permissionMode,
            sessionType: input.sessionType,
            worktreeName: input.worktreeName,
            collaborationMode: input.collaborationMode,
        }),
        // Keep Web's budget slightly above the runner's session-start webhook wait.
        timeoutMs: SPAWN_SESSION_REQUEST_TIMEOUT_MS,
    })

    if (isSpawnErrorResponse(response)) {
        return response
    }
    if (isSpawnSuccessResponse(response)) {
        return response
    }
    if (isSpawnLegacySuccessResponse(response)) {
        return {
            type: 'success',
            session: await fetchSessionSnapshot(response.sessionId),
        }
    }

    throw new Error('Invalid spawn session response')
}
