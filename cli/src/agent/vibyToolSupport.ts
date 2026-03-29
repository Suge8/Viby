import type {
    SessionTeamContext,
    TeamProjectSnapshot
} from '@viby/protocol/types'
import { z } from 'zod'
import type { ApiSessionClient } from '@/api/apiSession'
import type { VibyToolResult } from './vibyToolResults'

export type VibyToolExecutionContext = {
    client: ApiSessionClient
    teamContext?: SessionTeamContext
}

export type VibyToolDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>> = {
    name: string
    title: string
    description: string
    inputSchema: z.ZodType<TArgs>
    isEnabled: (teamContext?: SessionTeamContext) => boolean
    execute: (
        context: VibyToolExecutionContext,
        args: TArgs
    ) => Promise<VibyToolResult>
}

export type AnyVibyToolDefinition = VibyToolDefinition<any>

export function createToolDefinition<TArgs extends Record<string, unknown>>(
    definition: VibyToolDefinition<TArgs>
): VibyToolDefinition<TArgs> {
    return definition
}

export function isTeamSession(teamContext?: SessionTeamContext): boolean {
    return typeof teamContext?.projectId === 'string' && teamContext.projectId.length > 0
}

export function isActiveManagerSession(teamContext?: SessionTeamContext): boolean {
    return teamContext?.sessionRole === 'manager' && teamContext.projectStatus === 'active'
}

export function isMemberSessionWithRole(
    teamContext: SessionTeamContext | undefined,
    memberRole: 'reviewer' | 'verifier'
): boolean {
    return teamContext?.sessionRole === 'member'
        && teamContext.memberRole === memberRole
        && typeof teamContext.memberId === 'string'
        && teamContext.memberId.length > 0
}

export function requireTeamContext(teamContext?: SessionTeamContext): SessionTeamContext {
    if (!teamContext) {
        throw new Error('Current session is not attached to a manager-teams project')
    }

    return teamContext
}

export function requireMemberContext(
    teamContext: SessionTeamContext | undefined,
    memberRole: 'reviewer' | 'verifier'
): SessionTeamContext & { memberId: string; memberRole: 'reviewer' | 'verifier' } {
    const resolved = requireTeamContext(teamContext)
    if (!isMemberSessionWithRole(resolved, memberRole)) {
        throw new Error(`Current session is not an active ${memberRole} member`)
    }

    return resolved as SessionTeamContext & { memberId: string; memberRole: 'reviewer' | 'verifier' }
}

export async function fetchSnapshotForCurrentTeam(
    client: ApiSessionClient,
    teamContext: SessionTeamContext
): Promise<TeamProjectSnapshot> {
    return await client.getTeamProject(teamContext.projectId)
}
