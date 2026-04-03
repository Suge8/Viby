import type { SessionActivityKind } from './sessionActivity'

export type ActiveSessionTurnState = 'processing' | 'awaiting-input'

export type SessionTurnStateOptions = Readonly<{
    thinking: boolean
    pendingRequestsCount: number
    latestActivityKind: SessionActivityKind | null
}>

export type SessionReadyForInputOptions = SessionTurnStateOptions & Readonly<{
    active: boolean
}>

const PROCESSING_ACTIVITY_KINDS: readonly SessionActivityKind[] = ['reply', 'user']
const READY_ACTIVITY_KIND: SessionActivityKind = 'ready'

function isProcessingActivityKind(kind: SessionActivityKind | null): boolean {
    return kind !== null && PROCESSING_ACTIVITY_KINDS.includes(kind)
}

export function getPendingRequestsCount(agentState: {
    requests?: Record<string, unknown> | null
} | null | undefined): number {
    const requests = agentState?.requests
    if (!requests) {
        return 0
    }

    return Object.keys(requests).length
}

export function getActiveSessionTurnState(options: SessionTurnStateOptions): ActiveSessionTurnState {
    if (options.pendingRequestsCount > 0) {
        return 'awaiting-input'
    }

    if (options.thinking) {
        return 'processing'
    }

    if (isProcessingActivityKind(options.latestActivityKind)) {
        return 'processing'
    }

    return 'awaiting-input'
}

export function isSessionReadyForInput(options: SessionReadyForInputOptions): boolean {
    return options.active
        && !options.thinking
        && options.pendingRequestsCount === 0
        && options.latestActivityKind === READY_ACTIVITY_KIND
}
