import { getTeamRoleDisplayName } from '@viby/protocol'
import type { Session, SessionSummary } from '@/types/api'

type SessionTitleSource = Pick<SessionSummary, 'id' | 'metadata'> | Pick<Session, 'id' | 'metadata'>
type SessionListPresentationSource = Pick<SessionSummary, 'id' | 'metadata' | 'team'>
type MemberSessionPresentationSource = {
    sessionRole?: 'manager' | 'member'
    memberRole?: string
    memberRoleName?: string
    memberRevision?: number
} | null | undefined

const FALLBACK_SESSION_ID_LENGTH = 8
const SESSION_PROJECT_SEGMENT_COUNT = 2

export function getSessionTitle(session: SessionTitleSource): string {
    if (session.metadata?.name) {
        return session.metadata.name
    }

    if (session.metadata?.summary?.text) {
        return session.metadata.summary.text
    }

    if (session.metadata?.path) {
        const parts = session.metadata.path.split('/').filter(Boolean)
        if (parts.length > 0) {
            return parts[parts.length - 1]
        }
    }

    return session.id.slice(0, FALLBACK_SESSION_ID_LENGTH)
}

export function getMemberRoleDisplayName(team: MemberSessionPresentationSource): string {
    return getTeamRoleDisplayName(team?.memberRole ?? 'member', {
        roleName: team?.memberRoleName
    })
}

export function getMemberSessionTitle(team: MemberSessionPresentationSource): string | null {
    if (team?.sessionRole !== 'member') {
        return null
    }

    return `${getMemberRoleDisplayName(team)} · r${team.memberRevision ?? 1}`
}

export function getSessionListTitle(session: SessionListPresentationSource): string {
    const memberTitle = getMemberSessionTitle(session.team)
    if (memberTitle) {
        return memberTitle
    }

    return getSessionTitle(session)
}

export function getSessionProjectLabel(session: SessionTitleSource): string {
    const path = session.metadata?.worktree?.basePath ?? session.metadata?.path
    if (!path) {
        return session.id.slice(0, FALLBACK_SESSION_ID_LENGTH)
    }

    const parts = path.split(/[\\/]+/).filter(Boolean)
    if (parts.length === 0) {
        return path
    }

    return parts.slice(-SESSION_PROJECT_SEGMENT_COUNT).join('/')
}

export function getSessionListContextLabel(session: SessionListPresentationSource): string {
    if (session.team?.sessionRole === 'member') {
        return session.team.managerTitle?.trim() || 'Manager'
    }

    return getSessionProjectLabel(session)
}
