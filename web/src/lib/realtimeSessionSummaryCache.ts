import {
    compareSessionSummaries,
    getSessionActivityKind,
    mergeSessionMessageActivity,
    normalizeSessionActivityTimestamp,
    resolveSessionSummaryUpdatedAt,
    shouldMessageAdvanceSessionUpdatedAt,
    toSessionSummary
} from '@viby/protocol'
import type {
    Session,
    SessionsResponse,
    SessionSummary,
    SyncEvent
} from '@/types/api'
import { type SessionPatch } from '@/lib/realtimeEventGuards'

type SessionSummaryCacheResult = {
    next: SessionsResponse | undefined
    patched: boolean
}

type MutableSessionSummaryTarget = {
    nextSessions: SessionSummary[]
    index: number
    current: SessionSummary
}

export function upsertSessionSummaryCache(
    previous: SessionsResponse | undefined,
    session: Session
): SessionsResponse | undefined {
    if (!previous) {
        return previous
    }

    const summary = toSessionSummary(session)
    const nextSessions = previous.sessions.slice()
    const existingIndex = nextSessions.findIndex((item) => item.id === session.id)
    if (existingIndex >= 0) {
        nextSessions[existingIndex] = summary
    } else {
        nextSessions.push(summary)
    }

    nextSessions.sort(compareSessionSummaries)
    return { ...previous, sessions: nextSessions }
}

export function patchSessionSummaryCache(
    previous: SessionsResponse | undefined,
    sessionId: string,
    patch: SessionPatch
): SessionSummaryCacheResult {
    if (!previous) {
        return { next: previous, patched: false }
    }

    const target = resolveMutableSessionSummaryTarget(previous, sessionId)
    if (!target) {
        return { next: previous, patched: false }
    }

    const nextLifecycleState = resolveNextLifecycleState(target.current, patch)
    target.nextSessions[target.index] = {
        ...target.current,
        active: patch.active ?? target.current.active,
        thinking: patch.thinking ?? target.current.thinking,
        activeAt: patch.activeAt ?? target.current.activeAt,
        updatedAt: patch.updatedAt ?? target.current.updatedAt,
        lifecycleState: nextLifecycleState,
        lifecycleStateSince: shouldUpdateLifecycleStateSince(target.current, patch, nextLifecycleState)
            ? resolveNextLifecycleStateSince(target.current, patch)
            : target.current.lifecycleStateSince,
        model: Object.prototype.hasOwnProperty.call(patch, 'model') ? patch.model ?? null : target.current.model,
        modelReasoningEffort: Object.prototype.hasOwnProperty.call(patch, 'modelReasoningEffort')
            ? patch.modelReasoningEffort ?? null
            : target.current.modelReasoningEffort,
        permissionMode: patch.permissionMode ?? target.current.permissionMode,
        collaborationMode: patch.collaborationMode ?? target.current.collaborationMode
    }

    target.nextSessions.sort(compareSessionSummaries)
    return {
        next: { ...previous, sessions: target.nextSessions },
        patched: true
    }
}

export function patchSessionSummaryFromMessageCache(
    previous: SessionsResponse | undefined,
    sessionId: string,
    message: Extract<SyncEvent, { type: 'message-received' }>['message']
): SessionSummaryCacheResult {
    if (!previous) {
        return { next: previous, patched: false }
    }

    const target = resolveMutableSessionSummaryTarget(previous, sessionId)
    if (!target) {
        return { next: previous, patched: false }
    }

    const messageKind = getSessionActivityKind(message.content)
    const nextActivity = mergeSessionMessageActivity(
        {
            latestActivityAt: target.current.latestActivityAt,
            latestActivityKind: target.current.latestActivityKind,
            latestCompletedReplyAt: target.current.latestCompletedReplyAt
        },
        message
    )
    const normalizedMessageUpdatedAt = normalizeSessionActivityTimestamp(message.createdAt)
    const nextUpdatedAt = shouldMessageAdvanceSessionUpdatedAt(messageKind) && normalizedMessageUpdatedAt !== null
        ? resolveSessionSummaryUpdatedAt(normalizedMessageUpdatedAt, nextActivity.latestCompletedReplyAt)
        : target.current.updatedAt

    if (
        nextActivity.latestActivityAt === target.current.latestActivityAt
        && nextActivity.latestActivityKind === target.current.latestActivityKind
        && nextActivity.latestCompletedReplyAt === target.current.latestCompletedReplyAt
        && nextUpdatedAt === target.current.updatedAt
    ) {
        return { next: previous, patched: false }
    }

    target.nextSessions[target.index] = {
        ...target.current,
        updatedAt: nextUpdatedAt,
        latestActivityAt: nextActivity.latestActivityAt,
        latestActivityKind: nextActivity.latestActivityKind,
        latestCompletedReplyAt: nextActivity.latestCompletedReplyAt
    }
    target.nextSessions.sort(compareSessionSummaries)

    return {
        next: { ...previous, sessions: target.nextSessions },
        patched: true
    }
}

export function removeSessionSummaryCache(
    previous: SessionsResponse | undefined,
    sessionId: string
): SessionsResponse | undefined {
    if (!previous) {
        return previous
    }

    const nextSessions = previous.sessions.filter((item) => item.id !== sessionId)
    if (nextSessions.length === previous.sessions.length) {
        return previous
    }

    return { ...previous, sessions: nextSessions }
}

function resolveNextLifecycleState(
    current: SessionSummary,
    patch: SessionPatch
): SessionSummary['lifecycleState'] {
    if (patch.lifecycleStateHint) {
        return patch.lifecycleStateHint
    }

    if (patch.active === true) {
        return 'running'
    }

    if (patch.active === false) {
        return current.lifecycleState === 'archived' ? 'archived' : 'closed'
    }

    return current.lifecycleState
}

function resolveNextLifecycleStateSince(current: SessionSummary, patch: SessionPatch): number | null {
    if (patch.lifecycleStateSinceHint !== undefined) {
        return patch.lifecycleStateSinceHint
    }

    if (patch.active === true) {
        return patch.activeAt ?? patch.updatedAt ?? current.activeAt ?? current.updatedAt
    }

    if (patch.active === false) {
        return patch.updatedAt ?? current.updatedAt
    }

    return current.lifecycleStateSince
}

function shouldUpdateLifecycleStateSince(
    current: SessionSummary,
    patch: SessionPatch,
    nextLifecycleState: SessionSummary['lifecycleState']
): boolean {
    return patch.lifecycleStateSinceHint !== undefined || nextLifecycleState !== current.lifecycleState
}

function resolveMutableSessionSummaryTarget(
    previous: SessionsResponse,
    sessionId: string
): MutableSessionSummaryTarget | null {
    const nextSessions = previous.sessions.slice()
    const index = nextSessions.findIndex((item) => item.id === sessionId)
    if (index < 0) {
        return null
    }

    const current = nextSessions[index]
    if (!current) {
        return null
    }

    return {
        nextSessions,
        index,
        current
    }
}
