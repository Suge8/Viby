import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode } from './modes'
import type { Session, SessionDriver, SessionDriverHandles, WorktreeMetadata } from './schemas'
import {
    createEmptySessionMessageActivity,
    type SessionActivityKind,
    type SessionMessageActivity,
} from './sessionActivity'
import { resolveSessionDriver } from './sessionDriver'
import { getSessionLifecycleRank, resolveSessionInteractivity, type SessionLifecycleState } from './sessionLifecycle'
import { resolveSessionResumeState, type SessionResumeStrategy } from './sessionResume'
import { getPendingRequestsCount } from './sessionTurnState'

export type SessionSummaryMetadata = {
    name?: string
    path: string
    summary?: {
        text: string
        updatedAt: number
    }
    driver?: SessionDriver | null
    runtimeHandles?: SessionDriverHandles
    lifecycleState?: SessionLifecycleState
    startedBy?: 'runner' | 'terminal'
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
    resumeAvailable: boolean
    resumeStrategy: SessionResumeStrategy
    model: string | null
    modelReasoningEffort: ModelReasoningEffort | null
    permissionMode?: PermissionMode
    collaborationMode?: CodexCollaborationMode
}

type SessionSummarySortTimestampSource = Pick<SessionSummary, 'lifecycleState' | 'lifecycleStateSince' | 'updatedAt'>

type SessionSummaryOrderSource = Pick<SessionSummary, 'id' | 'lifecycleState' | 'lifecycleStateSince' | 'updatedAt'>

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

export function compareSessionSummaries(left: SessionSummaryOrderSource, right: SessionSummaryOrderSource): number {
    const lifecycleRank = getSessionLifecycleRank(left.lifecycleState) - getSessionLifecycleRank(right.lifecycleState)
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
    const pendingRequestsCount = getPendingRequestsCount(session.agentState)
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
    const resolvedDriver = resolveSessionDriver(session.metadata)
    const resumeState = resolveSessionResumeState({
        metadata: session.metadata,
        resumeAvailableHint: getOptionalResumeAvailabilityHint(session),
    })
    const interactivity = resolveSessionInteractivity({
        ...session,
        resumeState,
    })

    const metadata: SessionSummaryMetadata | null = session.metadata
        ? {
              name: session.metadata.name,
              path: session.metadata.path,
              summary: session.metadata.summary
                  ? {
                        text: session.metadata.summary.text,
                        updatedAt: session.metadata.summary.updatedAt,
                    }
                  : undefined,
              driver: resolvedDriver,
              runtimeHandles: session.metadata.runtimeHandles,
              lifecycleState: session.metadata.lifecycleState,
              startedBy: session.metadata.startedBy,
              worktree: session.metadata.worktree,
          }
        : null

    const todoProgress = session.todos?.length
        ? {
              completed: session.todos.filter((t) => t.status === 'completed').length,
              total: session.todos.length,
          }
        : null

    return {
        id: session.id,
        active: session.active,
        thinking: session.thinking,
        activeAt: session.activeAt,
        updatedAt,
        latestActivityAt,
        latestActivityKind,
        latestCompletedReplyAt,
        lifecycleState: interactivity.lifecycleState,
        lifecycleStateSince: session.metadata?.lifecycleStateSince ?? null,
        metadata,
        todoProgress,
        pendingRequestsCount,
        resumeAvailable: interactivity.resumeAvailable,
        resumeStrategy: resumeState.resumeStrategy,
        model: session.model,
        modelReasoningEffort: session.modelReasoningEffort,
        permissionMode: session.permissionMode,
        collaborationMode: session.collaborationMode,
    }
}

export function getSessionMessageActivityFromSession(session: Session): SessionMessageActivity {
    return {
        latestActivityAt: session.latestActivityAt ?? null,
        latestActivityKind: session.latestActivityKind ?? null,
        latestCompletedReplyAt: session.latestCompletedReplyAt ?? null,
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

function getOptionalResumeAvailabilityHint(session: Session): boolean | undefined {
    if (!('resumeAvailable' in session) || typeof session.resumeAvailable !== 'boolean') {
        return undefined
    }

    return session.resumeAvailable
}
