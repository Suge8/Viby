import type {
    Session,
    TeamProjectSnapshot
} from '@/types/api'
import type { ApiClientRequest } from './client'

type SessionActionResponse = {
    ok: true
    session: Session
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

export async function getTeamProject(
    request: ApiClientRequest,
    projectId: string
): Promise<TeamProjectSnapshot> {
    return await request<TeamProjectSnapshot>(
        `/api/team-projects/${encodeURIComponent(projectId)}`
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
    const response = await request<unknown>(
        `/api/team-members/${encodeURIComponent(memberId)}/interject`,
        {
            method: 'POST',
            body: JSON.stringify({
                text: input.text,
                localId: input.localId ?? undefined
            })
        }
    )

    if (!isSessionActionResponse(response)) {
        throw new Error('Invalid team member interject response')
    }

    return response.session
}

export async function takeOverTeamMember(
    request: ApiClientRequest,
    memberId: string
): Promise<Session> {
    const response = await request<unknown>(
        `/api/team-members/${encodeURIComponent(memberId)}/takeover`,
        {
            method: 'POST',
            body: JSON.stringify({})
        }
    )

    if (!isSessionActionResponse(response)) {
        throw new Error('Invalid team member takeover response')
    }

    return response.session
}

export async function returnTeamMember(
    request: ApiClientRequest,
    memberId: string
): Promise<Session> {
    const response = await request<unknown>(
        `/api/team-members/${encodeURIComponent(memberId)}/return`,
        {
            method: 'POST',
            body: JSON.stringify({})
        }
    )

    if (!isSessionActionResponse(response)) {
        throw new Error('Invalid team member return response')
    }

    return response.session
}
