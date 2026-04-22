import { isHiddenAgentMetaOutput, unwrapRoleWrappedRecordEnvelope } from './messages'
import { isObject } from './utils'

export type SessionActivityKind = 'reply' | 'ready' | 'user'

type MessageEventData = {
    type: string
}

export type SessionMessageActivity = {
    latestActivityAt: number | null
    latestActivityKind: SessionActivityKind | null
    latestCompletedReplyAt: number | null
}

type SessionMessageLike = {
    content: unknown
    createdAt: number
}

export function createEmptySessionMessageActivity(): SessionMessageActivity {
    return {
        latestActivityAt: null,
        latestActivityKind: null,
        latestCompletedReplyAt: null,
    }
}

export function normalizeSessionActivityTimestamp(value: number | null | undefined): number | null {
    const numericValue = value ?? null
    if (numericValue === null || !Number.isFinite(numericValue) || numericValue <= 0) {
        return null
    }

    return numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue
}

export function getSessionActivityKind(content: unknown): SessionActivityKind | null {
    if (isHiddenAgentMetaOutput(content)) {
        return null
    }

    const record = unwrapRoleWrappedRecordEnvelope(content)
    if (!record) {
        return null
    }

    if (record.role === 'user') {
        return 'user'
    }

    if (record.role !== 'agent') {
        return null
    }

    const payload = record.content
    if (isObject(payload) && payload.type === 'event' && isObject(payload.data)) {
        const eventData = payload.data as MessageEventData
        if (eventData.type === 'ready') {
            return 'ready'
        }
        if (eventData.type === 'driver-switched' || eventData.type === 'driver-switch-send-failed') {
            return null
        }
    }

    return 'reply'
}

export function shouldMessageAdvanceSessionUpdatedAt(kind: SessionActivityKind | null): boolean {
    return kind === 'user' || kind === 'ready'
}

export function mergeSessionMessageActivity(
    current: SessionMessageActivity,
    message: SessionMessageLike
): SessionMessageActivity {
    const kind = getSessionActivityKind(message.content)
    if (!kind) {
        return current
    }

    const nextCreatedAt = normalizeSessionActivityTimestamp(message.createdAt)
    if (nextCreatedAt === null) {
        return current
    }

    let changed = false
    let latestActivityAt = current.latestActivityAt
    let latestActivityKind = current.latestActivityKind
    let latestCompletedReplyAt = current.latestCompletedReplyAt

    if (kind === 'ready' && current.latestActivityKind === 'reply' && current.latestActivityAt !== null) {
        if (latestCompletedReplyAt === null || current.latestActivityAt > latestCompletedReplyAt) {
            latestCompletedReplyAt = current.latestActivityAt
            changed = true
        }
    }

    if (latestActivityAt === null || nextCreatedAt >= latestActivityAt) {
        latestActivityAt = nextCreatedAt
        latestActivityKind = kind
        changed = true
    }

    if (!changed) {
        return current
    }

    return {
        latestActivityAt,
        latestActivityKind,
        latestCompletedReplyAt,
    }
}
