import { isSessionRunningSectionLifecycleState } from '@viby/protocol'
import type { SessionLifecycleState } from '@/types/api'

export type SessionActionAvailabilityState = {
    lifecycleState: SessionLifecycleState
}

const SESSION_ACTION_IDS = ['stop', 'rename', 'delete'] as const
export type SessionActionId = (typeof SESSION_ACTION_IDS)[number]
export type ConfirmableSessionActionId = Extract<SessionActionId, 'stop' | 'delete'>

export function getAvailableSessionActionIds(session: SessionActionAvailabilityState): SessionActionId[] {
    if (isSessionRunningSectionLifecycleState(session.lifecycleState)) {
        return ['stop', 'rename']
    }

    return ['rename', 'delete']
}

export function isConfirmableSessionActionId(actionId: SessionActionId): actionId is ConfirmableSessionActionId {
    return actionId === 'stop' || actionId === 'delete'
}
