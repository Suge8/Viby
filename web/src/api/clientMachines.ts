import type {
    CodexCollaborationMode,
    MachineBrowseDirectoryResponse,
    MachinePathsExistsResponse,
    MachinesResponse,
    ModelReasoningEffort,
    PermissionMode,
    Session,
    SpawnResponse,
    TeamSessionSpawnRole,
} from '@/types/api'
import type { ApiClientFetchSessionSnapshot, ApiClientRequest } from './client'

type SpawnErrorResponse = {
    type: 'error'
    message: string
}

type SpawnSuccessResponse = {
    type: 'success'
    session: Session
}

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

export async function getMachines(
    request: ApiClientRequest
): Promise<MachinesResponse> {
    return await request<MachinesResponse>('/api/machines')
}

export async function checkMachinePathsExists(
    request: ApiClientRequest,
    machineId: string,
    paths: string[]
): Promise<MachinePathsExistsResponse> {
    return await request<MachinePathsExistsResponse>(
        `/api/machines/${encodeURIComponent(machineId)}/paths/exists`,
        {
            method: 'POST',
            body: JSON.stringify({ paths })
        }
    )
}

export async function browseMachineDirectory(
    request: ApiClientRequest,
    machineId: string,
    path?: string
): Promise<MachineBrowseDirectoryResponse> {
    const params = new URLSearchParams()
    if (path) {
        params.set('path', path)
    }
    const queryString = params.toString()

    return await request<MachineBrowseDirectoryResponse>(
        `/api/machines/${encodeURIComponent(machineId)}/directory${queryString ? `?${queryString}` : ''}`
    )
}

export async function spawnSession(
    request: ApiClientRequest,
    fetchSessionSnapshot: ApiClientFetchSessionSnapshot,
    input: {
        machineId: string
        directory: string
        agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
        model?: string
        modelReasoningEffort?: ModelReasoningEffort
        permissionMode?: PermissionMode
        sessionRole?: TeamSessionSpawnRole
        sessionType?: 'simple' | 'worktree'
        worktreeName?: string
        collaborationMode?: CodexCollaborationMode
    }
): Promise<SpawnResponse> {
    const response = await request<unknown>(`/api/machines/${encodeURIComponent(input.machineId)}/spawn`, {
        method: 'POST',
        body: JSON.stringify({
            directory: input.directory,
            agent: input.agent,
            model: input.model,
            modelReasoningEffort: input.modelReasoningEffort,
            permissionMode: input.permissionMode,
            sessionRole: input.sessionRole,
            sessionType: input.sessionType,
            worktreeName: input.worktreeName,
            collaborationMode: input.collaborationMode
        })
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
            session: await fetchSessionSnapshot(response.sessionId)
        }
    }

    throw new Error('Invalid spawn session response')
}
