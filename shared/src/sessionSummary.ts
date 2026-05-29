import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode } from './modes'
import type { Session, SessionDriver, SessionDriverHandles, SessionStreamState, WorktreeMetadata } from './schemas'
import {
    createEmptySessionMessageActivity,
    type SessionActivityKind,
    type SessionMessageActivity,
} from './sessionActivity'
import { resolveSessionDriver } from './sessionDriver'
import { getSessionLifecycleRank, resolveSessionInteractivity, type SessionLifecycleState } from './sessionLifecycle'
import { resolveSessionResumeState, type SessionResumeStrategy } from './sessionResume'
import { getActiveSessionTurnState, getPendingRequestsCount } from './sessionTurnState'

export type SessionSummaryMetadata = {
    name?: string
    path: string
    host?: string
    machineId?: string
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
    codexServiceTier: Session['codexServiceTier']
    permissionMode?: PermissionMode
    collaborationMode?: CodexCollaborationMode
}

type SessionSummarySortTimestampSource = Pick<
    SessionSummary,
    'latestCompletedReplyAt' | 'lifecycleState' | 'lifecycleStateSince' | 'updatedAt'
>

type SessionSummaryOrderSource = Pick<
    SessionSummary,
    'id' | 'latestCompletedReplyAt' | 'lifecycleState' | 'lifecycleStateSince' | 'updatedAt'
>

export function resolveSessionSummaryUpdatedAt(
    sessionUpdatedAt: number,
    latestCompletedReplyAt: number | null
): number {
    return Math.max(sessionUpdatedAt, latestCompletedReplyAt ?? 0)
}

export function getSessionSummarySortTimestamp(summary: SessionSummarySortTimestampSource): number {
    if (summary.lifecycleState === 'running' || summary.lifecycleState === 'open') {
        return summary.lifecycleStateSince ?? summary.latestCompletedReplyAt ?? summary.updatedAt
    }

    return summary.latestCompletedReplyAt ?? summary.lifecycleStateSince ?? summary.updatedAt
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

export function projectSessionSummaryActiveStream(
    summary: SessionSummary,
    stream: Pick<SessionStreamState, 'startedAt' | 'updatedAt'> | null | undefined
): SessionSummary {
    if (!stream || getActiveSessionTurnState(summary) === 'processing') {
        return summary
    }

    return {
        ...summary,
        latestActivityAt: getTransientStreamActivityAt(summary, stream),
        latestActivityKind: 'reply',
    }
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
              host: session.metadata.host,
              machineId: session.metadata.machineId,
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
        codexServiceTier: session.codexServiceTier,
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

function getTransientStreamActivityAt(
    summary: Pick<SessionSummary, 'latestActivityAt' | 'latestCompletedReplyAt'>,
    stream: Pick<SessionStreamState, 'startedAt' | 'updatedAt'>
): number {
    const streamActivityAt = Math.max(
        normalizeTransientTimestamp(stream.startedAt),
        normalizeTransientTimestamp(stream.updatedAt)
    )
    return Math.max(streamActivityAt, summary.latestActivityAt ?? 0, (summary.latestCompletedReplyAt ?? 0) + 1)
}

function normalizeTransientTimestamp(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0
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
