import type { SessionActivityKind } from './sessionActivity'

export type ActiveSessionTurnState = 'processing' | 'awaiting-input'

export type SessionTurnStateOptions = Readonly<{
    thinking: boolean
    activeAt: number | null
    pendingRequestsCount: number
    latestActivityAt: number | null
    latestActivityKind: SessionActivityKind | null
    latestCompletedReplyAt: number | null
}>

export type SessionReadyForInputOptions = SessionTurnStateOptions &
    Readonly<{
        active: boolean
    }>

const REPLY_ACTIVITY_KIND: SessionActivityKind = 'reply'
const USER_ACTIVITY_KIND: SessionActivityKind = 'user'
const READY_ACTIVITY_KIND: SessionActivityKind = 'ready'

export function getPendingRequestsCount(
    agentState:
        | {
              requests?: Record<string, unknown> | null
          }
        | null
        | undefined
): number {
    const requests = agentState?.requests
    if (!requests) {
        return 0
    }

    return Object.keys(requests).length
}

export function getActiveSessionTurnState(options: SessionTurnStateOptions): ActiveSessionTurnState {
    if (options.thinking) {
        return 'processing'
    }

    if (options.latestActivityKind === USER_ACTIVITY_KIND) {
        return 'processing'
    }

    if (hasUncompletedReply(options)) {
        return 'processing'
    }

    if (options.pendingRequestsCount > 0) {
        return 'awaiting-input'
    }

    return 'awaiting-input'
}

export function isSessionReadyForInput(options: SessionReadyForInputOptions): boolean {
    return (
        options.active &&
        !options.thinking &&
        options.pendingRequestsCount === 0 &&
        options.latestActivityKind === READY_ACTIVITY_KIND &&
        options.latestCompletedReplyAt !== null
    )
}

function hasUncompletedReply(options: SessionTurnStateOptions): boolean {
    return (
        options.latestActivityKind === REPLY_ACTIVITY_KIND &&
        options.latestActivityAt !== null &&
        !hasCompletedReply(options)
    )
}

function hasCompletedReply(options: SessionTurnStateOptions): boolean {
    return (
        options.latestCompletedReplyAt !== null &&
        options.latestActivityAt !== null &&
        options.latestActivityAt <= options.latestCompletedReplyAt
    )
}
