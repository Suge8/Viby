import type { SessionListRenderContext, SessionListSelection } from '@/components/session-list/sessionListContracts'
import type { SessionSummary } from '@/types/api'

export function getSessionTabButtonClassName(active: boolean): string {
    if (active) {
        return 'ds-session-tab-button h-full w-full gap-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-canvas)] px-3 py-2 text-sm font-medium text-[var(--ds-text-primary)] shadow-[var(--ds-shadow-soft)]'
    }

    return 'ds-session-tab-button h-full w-full gap-2 rounded-[var(--ds-radius-md)] px-3 py-2 text-sm font-medium text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)]'
}

export function areSessionListRowsEquivalent(previous: SessionSummary, next: SessionSummary): boolean {
    return (
        previous.id === next.id &&
        previous.updatedAt === next.updatedAt &&
        previous.lifecycleState === next.lifecycleState &&
        previous.lifecycleStateSince === next.lifecycleStateSince &&
        previous.thinking === next.thinking &&
        previous.latestActivityKind === next.latestActivityKind &&
        previous.pendingRequestsCount === next.pendingRequestsCount &&
        previous.model === next.model &&
        previous.todoProgress?.completed === next.todoProgress?.completed &&
        previous.todoProgress?.total === next.todoProgress?.total &&
        previous.metadata?.name === next.metadata?.name &&
        previous.metadata?.summary?.text === next.metadata?.summary?.text &&
        previous.metadata?.path === next.metadata?.path &&
        previous.metadata?.driver === next.metadata?.driver &&
        previous.metadata?.worktree?.branch === next.metadata?.worktree?.branch &&
        previous.metadata?.worktree?.basePath === next.metadata?.worktree?.basePath
    )
}

export function areSessionListSelectionsEquivalent(
    previous: SessionListSelection,
    next: SessionListSelection
): boolean {
    return (
        previous.selectedSessionId === next.selectedSessionId &&
        previous.onSelect === next.onSelect &&
        previous.onIntent === next.onIntent
    )
}

export function areSessionListRenderContextsEquivalent(
    previous: SessionListRenderContext,
    next: SessionListRenderContext
): boolean {
    return (
        areSessionListSelectionsEquivalent(previous.selection, next.selection) &&
        previous.hasUnseenReply === next.hasUnseenReply &&
        previous.onOpenActionMenu === next.onOpenActionMenu
    )
}
