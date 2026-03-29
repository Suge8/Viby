import type {
    Session,
    TeamProject,
    TeamProjectHistoryResponse,
    TeamProjectPreset,
    TeamProjectSnapshot,
    TeamRoleDefinition,
} from '@/types/api'
import type { ApiClientRequest } from './client'

type SessionActionResponse = {
    ok: true
    session: Session
}

type TeamRoleResponse = {
    ok: true
    role: TeamRoleDefinition
}

type TeamRoleDeleteResponse = {
    ok: true
    roleId: TeamRoleDefinition['id']
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isSession(value: unknown): value is Session {
    return isRecord(value) && typeof value.id === 'string'
}

function isSessionActionResponse(value: unknown): value is SessionActionResponse {
    return isRecord(value) && value.ok === true && isSession(value.session)
}

function isTeamRoleDefinition(value: unknown): value is TeamRoleDefinition {
    return isRecord(value)
        && typeof value.id === 'string'
        && typeof value.projectId === 'string'
        && typeof value.prototype === 'string'
}

function isTeamRoleResponse(value: unknown): value is TeamRoleResponse {
    return isRecord(value) && value.ok === true && isTeamRoleDefinition(value.role)
}

function isTeamRoleDeleteResponse(value: unknown): value is TeamRoleDeleteResponse {
    return isRecord(value) && value.ok === true && typeof value.roleId === 'string'
}

type TeamMemberSessionAction = 'interject' | 'takeover' | 'return'

function getTeamMemberActionPath(
    memberId: string,
    action: TeamMemberSessionAction
): string {
    return `/api/team-members/${encodeURIComponent(memberId)}/${action}`
}

function getInvalidTeamMemberActionResponseMessage(
    action: TeamMemberSessionAction
): string {
    switch (action) {
        case 'interject':
            return 'Invalid team member interject response'
        case 'takeover':
            return 'Invalid team member takeover response'
        case 'return':
            return 'Invalid team member return response'
    }
}

async function postTeamMemberSessionAction(
    request: ApiClientRequest,
    memberId: string,
    action: TeamMemberSessionAction,
    body: Record<string, unknown>
): Promise<Session> {
    const response = await request<unknown>(getTeamMemberActionPath(memberId, action), {
        method: 'POST',
        body: JSON.stringify(body)
    })

    if (!isSessionActionResponse(response)) {
        throw new Error(getInvalidTeamMemberActionResponseMessage(action))
    }

    return response.session
}

export async function getTeamProject(
    request: ApiClientRequest,
    projectId: string
): Promise<TeamProjectSnapshot> {
    return await request<TeamProjectSnapshot>(
        `/api/team-projects/${encodeURIComponent(projectId)}`
    )
}

export async function getTeamProjectHistory(
    request: ApiClientRequest,
    projectId: string
): Promise<TeamProjectHistoryResponse> {
    return await request<TeamProjectHistoryResponse>(
        `/api/team-projects/${encodeURIComponent(projectId)}/history`
    )
}

export async function getTeamProjectPreset(
    request: ApiClientRequest,
    projectId: string
): Promise<TeamProjectPreset> {
    return await request<TeamProjectPreset>(
        `/api/team-projects/${encodeURIComponent(projectId)}/preset`
    )
}

export async function updateTeamProjectSettings(
    request: ApiClientRequest,
    projectId: string,
    input: {
        managerSessionId: string
        maxActiveMembers: number
        defaultIsolationMode: TeamProject['defaultIsolationMode']
    }
): Promise<TeamProjectSnapshot> {
    return await request<TeamProjectSnapshot>(
        `/api/team-projects/${encodeURIComponent(projectId)}/settings`,
        {
            method: 'PATCH',
            body: JSON.stringify(input)
        }
    )
}

export async function createTeamRole(
    request: ApiClientRequest,
    projectId: string,
    input: {
        managerSessionId: string
        roleId: string
        prototype: TeamRoleDefinition['prototype']
        name: string
        promptExtension?: string | null
        providerFlavor: TeamRoleDefinition['providerFlavor']
        model: string | null
        reasoningEffort: TeamRoleDefinition['reasoningEffort']
        isolationMode: TeamRoleDefinition['isolationMode']
    }
): Promise<TeamRoleDefinition> {
    const response = await request<unknown>(
        `/api/team-projects/${encodeURIComponent(projectId)}/roles`,
        {
            method: 'POST',
            body: JSON.stringify(input)
        }
    )

    if (!isTeamRoleResponse(response)) {
        throw new Error('Invalid team role create response')
    }

    return response.role
}

export async function updateTeamRole(
    request: ApiClientRequest,
    projectId: string,
    roleId: string,
    input: {
        managerSessionId: string
        name: string
        promptExtension?: string | null
        providerFlavor: TeamRoleDefinition['providerFlavor']
        model: string | null
        reasoningEffort: TeamRoleDefinition['reasoningEffort']
        isolationMode: TeamRoleDefinition['isolationMode']
    }
): Promise<TeamRoleDefinition> {
    const response = await request<unknown>(
        `/api/team-projects/${encodeURIComponent(projectId)}/roles/${encodeURIComponent(roleId)}`,
        {
            method: 'PATCH',
            body: JSON.stringify(input)
        }
    )

    if (!isTeamRoleResponse(response)) {
        throw new Error('Invalid team role update response')
    }

    return response.role
}

export async function deleteTeamRole(
    request: ApiClientRequest,
    projectId: string,
    roleId: string,
    input: {
        managerSessionId: string
    }
): Promise<string> {
    const response = await request<unknown>(
        `/api/team-projects/${encodeURIComponent(projectId)}/roles/${encodeURIComponent(roleId)}`,
        {
            method: 'DELETE',
            body: JSON.stringify(input)
        }
    )

    if (!isTeamRoleDeleteResponse(response)) {
        throw new Error('Invalid team role delete response')
    }

    return response.roleId
}

export async function applyTeamProjectPreset(
    request: ApiClientRequest,
    projectId: string,
    input: {
        managerSessionId: string
        preset: TeamProjectPreset
    }
): Promise<TeamProjectSnapshot> {
    return await request<TeamProjectSnapshot>(
        `/api/team-projects/${encodeURIComponent(projectId)}/preset`,
        {
            method: 'PUT',
            body: JSON.stringify(input)
        }
    )
}

export async function interjectTeamMember(
    request: ApiClientRequest,
    memberId: string,
    input: {
        text: string
        localId?: string | null
    }
): Promise<Session> {
    return await postTeamMemberSessionAction(request, memberId, 'interject', {
        text: input.text,
        localId: input.localId ?? undefined
    })
}

export async function takeOverTeamMember(
    request: ApiClientRequest,
    memberId: string
): Promise<Session> {
    return await postTeamMemberSessionAction(request, memberId, 'takeover', {})
}

export async function returnTeamMember(
    request: ApiClientRequest,
    memberId: string
): Promise<Session> {
    return await postTeamMemberSessionAction(request, memberId, 'return', {})
}
