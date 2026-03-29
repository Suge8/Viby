import type { SessionSummary } from '@/types/api'

export function getSessionTabButtonClassName(active: boolean): string {
    if (active) {
        return 'min-h-[44px] gap-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-canvas)] px-3 py-2 text-sm font-medium text-[var(--ds-text-primary)] shadow-[var(--ds-shadow-soft)]'
    }

    return 'min-h-[44px] gap-2 rounded-[var(--ds-radius-md)] px-3 py-2 text-sm font-medium text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)]'
}

export function areSessionListRowsEquivalent(previous: SessionSummary, next: SessionSummary): boolean {
    const previousTeam = previous.team
    const nextTeam = next.team

    return previous.id === next.id
        && previous.updatedAt === next.updatedAt
        && previous.lifecycleState === next.lifecycleState
        && previous.lifecycleStateSince === next.lifecycleStateSince
        && previous.thinking === next.thinking
        && previous.latestActivityKind === next.latestActivityKind
        && previous.pendingRequestsCount === next.pendingRequestsCount
        && previous.model === next.model
        && previous.todoProgress?.completed === next.todoProgress?.completed
        && previous.todoProgress?.total === next.todoProgress?.total
        && previous.metadata?.name === next.metadata?.name
        && previous.metadata?.summary?.text === next.metadata?.summary?.text
        && previous.metadata?.path === next.metadata?.path
        && previous.metadata?.flavor === next.metadata?.flavor
        && previous.metadata?.worktree?.branch === next.metadata?.worktree?.branch
        && previous.metadata?.worktree?.basePath === next.metadata?.worktree?.basePath
        && previousTeam?.sessionRole === nextTeam?.sessionRole
        && previousTeam?.managerSessionId === nextTeam?.managerSessionId
        && previousTeam?.managerTitle === nextTeam?.managerTitle
        && previousTeam?.memberRole === nextTeam?.memberRole
        && previousTeam?.memberRoleName === nextTeam?.memberRoleName
        && previousTeam?.memberRevision === nextTeam?.memberRevision
        && previousTeam?.controlOwner === nextTeam?.controlOwner
        && previousTeam?.membershipState === nextTeam?.membershipState
        && previousTeam?.projectStatus === nextTeam?.projectStatus
        && previousTeam?.activeMemberCount === nextTeam?.activeMemberCount
        && previousTeam?.archivedMemberCount === nextTeam?.archivedMemberCount
        && previousTeam?.runningMemberCount === nextTeam?.runningMemberCount
        && previousTeam?.blockedTaskCount === nextTeam?.blockedTaskCount
}
