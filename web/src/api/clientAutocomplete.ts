import type { SkillsResponse, SlashCommandsResponse } from '@/types/api'
import type { ApiClientRequest } from './client'

export async function getSlashCommands(
    request: ApiClientRequest,
    sessionId: string
): Promise<SlashCommandsResponse> {
    return await request<SlashCommandsResponse>(
        `/api/sessions/${encodeURIComponent(sessionId)}/slash-commands`
    )
}

export async function getSkills(
    request: ApiClientRequest,
    sessionId: string
): Promise<SkillsResponse> {
    return await request<SkillsResponse>(
        `/api/sessions/${encodeURIComponent(sessionId)}/skills`
    )
}
