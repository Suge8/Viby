import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode } from './modes'
import type { Session, WorktreeMetadata } from './schemas'
import {
    createEmptySessionMessageActivity,
    type SessionActivityKind,
    type SessionMessageActivity
} from './sessionActivity'
import { getSessionLifecycleState, type SessionLifecycleState } from './sessionLifecycle'

export type SessionSummaryMetadata = {
    name?: string
    path: string
    machineId?: string
    summary?: {
        text: string
        updatedAt: number
    }
    flavor?: string | null
    worktree?: WorktreeMetadata
}

export type SessionSummary = {
    id: string
    active: boolean
    thinking: boolean
    activeAt: number
    updatedAt: number
    latestActivityAt: number | null
    latestActivityKind: SessionActivityKind | null
    latestCompletedReplyAt: number | null
    lifecycleState: SessionLifecycleState
    lifecycleStateSince: number | null
    metadata: SessionSummaryMetadata | null
    todoProgress: { completed: number; total: number } | null
    pendingRequestsCount: number
    model: string | null
    modelReasoningEffort: ModelReasoningEffort | null
    permissionMode?: PermissionMode
    collaborationMode?: CodexCollaborationMode
}

type SessionSummarySortTimestampSource = Pick<
    SessionSummary,
    'lifecycleState' | 'lifecycleStateSince' | 'updatedAt'
>

type SessionSummaryOrderSource = Pick<
    SessionSummary,
    'id' | 'lifecycleState' | 'lifecycleStateSince' | 'updatedAt'
>

export function resolveSessionSummaryUpdatedAt(
    sessionUpdatedAt: number,
    latestCompletedReplyAt: number | null
): number {
    return Math.max(sessionUpdatedAt, latestCompletedReplyAt ?? 0)
}

export function getSessionSummarySortTimestamp(summary: SessionSummarySortTimestampSource): number {
    if (summary.lifecycleState === 'running') {
        return summary.lifecycleStateSince ?? 0
    }

    return summary.updatedAt
}

export function compareSessionSummaries(
    left: SessionSummaryOrderSource,
    right: SessionSummaryOrderSource
): number {
    const lifecycleRank = getSessionSummaryLifecycleRank(left.lifecycleState) - getSessionSummaryLifecycleRank(right.lifecycleState)
    if (lifecycleRank !== 0) {
        return lifecycleRank
    }

    const timestampDiff = getSessionSummarySortTimestamp(right) - getSessionSummarySortTimestamp(left)
    if (timestampDiff !== 0) {
        return timestampDiff
    }

    return left.id.localeCompare(right.id)
}

export function toSessionSummary(session: Session, messageActivity?: SessionMessageActivity): SessionSummary {
    const pendingRequestsCount = session.agentState?.requests ? Object.keys(session.agentState.requests).length : 0
    const normalizedMessageActivity = messageActivity ?? createEmptySessionMessageActivity()
    // Session ordering must only follow stable session lifecycle timestamps and
    // completed reply activity. Auto title/summary metadata can change mid-turn
    // and must not be treated as message completion.
    const latestCompletedReplyAt = normalizedMessageActivity.latestCompletedReplyAt
    const latestActivityAt = normalizedMessageActivity.latestActivityAt ?? latestCompletedReplyAt
    const latestActivityKind = resolveLatestActivityKind(
        normalizedMessageActivity.latestActivityKind,
        latestActivityAt,
        latestCompletedReplyAt
    )
    const updatedAt = resolveSessionSummaryUpdatedAt(session.updatedAt, latestCompletedReplyAt)

    const metadata: SessionSummaryMetadata | null = session.metadata ? {
        name: session.metadata.name,
        path: session.metadata.path,
        machineId: session.metadata.machineId ?? undefined,
        summary: session.metadata.summary ? {
            text: session.metadata.summary.text,
            updatedAt: session.metadata.summary.updatedAt
        } : undefined,
        flavor: session.metadata.flavor ?? null,
        worktree: session.metadata.worktree
    } : null

    const todoProgress = session.todos?.length ? {
        completed: session.todos.filter(t => t.status === 'completed').length,
        total: session.todos.length
    } : null

    return {
        id: session.id,
        active: session.active,
        thinking: session.thinking,
        activeAt: session.activeAt,
        updatedAt,
        latestActivityAt,
        latestActivityKind,
        latestCompletedReplyAt,
        lifecycleState: getSessionLifecycleState(session),
        lifecycleStateSince: session.metadata?.lifecycleStateSince ?? null,
        metadata,
        todoProgress,
        pendingRequestsCount,
        model: session.model,
        modelReasoningEffort: session.modelReasoningEffort,
        permissionMode: session.permissionMode,
        collaborationMode: session.collaborationMode
    }
}

function resolveLatestActivityKind(
    activityKind: SessionActivityKind | null,
    latestActivityAt: number | null,
    latestCompletedReplyAt: number | null
): SessionActivityKind | null {
    if (activityKind !== null) {
        return activityKind
    }

    if (latestActivityAt !== null && latestActivityAt === latestCompletedReplyAt) {
        return 'ready'
    }

    return null
}

function getSessionSummaryLifecycleRank(lifecycleState: SessionLifecycleState): number {
    if (lifecycleState === 'running') {
        return 0
    }

    if (lifecycleState === 'closed') {
        return 1
    }

    return 2
}
