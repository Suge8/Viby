import { isSessionRunningSectionLifecycleState } from '@viby/protocol'
import type { SessionLifecycleState } from '@/types/api'

export type SessionActionAvailabilityState = {
    lifecycleState: SessionLifecycleState
    hasDirectory?: boolean
}

const SESSION_ACTION_IDS = ['new-session', 'stop', 'rename', 'delete'] as const
export type SessionActionId = (typeof SESSION_ACTION_IDS)[number]
export type ConfirmableSessionActionId = Extract<SessionActionId, 'stop' | 'delete'>

export function getAvailableSessionActionIds(session: SessionActionAvailabilityState): SessionActionId[] {
    const directoryActions: SessionActionId[] = session.hasDirectory ? ['new-session'] : []

    if (isSessionRunningSectionLifecycleState(session.lifecycleState)) {
        return [...directoryActions, 'stop', 'rename']
    }

    return [...directoryActions, 'rename', 'delete']
}

export function isConfirmableSessionActionId(actionId: SessionActionId): actionId is ConfirmableSessionActionId {
    return actionId === 'stop' || actionId === 'delete'
}
