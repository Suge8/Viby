import type { Metadata, Session } from './schemas'
import { getSessionDriverResumeToken } from './sessionDriver'

export const SESSION_LIFECYCLE_STATES = ['running', 'closed', 'archived'] as const

export type SessionLifecycleState = (typeof SESSION_LIFECYCLE_STATES)[number]

type SessionLifecycleSource = {
    active: boolean
    metadata: Pick<Metadata, 'lifecycleState'> | null
}

export function getSessionLifecycleState(session: SessionLifecycleSource): SessionLifecycleState {
    if (session.active) {
        return 'running'
    }

    return session.metadata?.lifecycleState === 'archived' ? 'archived' : 'closed'
}

export function isSessionArchived(session: SessionLifecycleSource): boolean {
    return getSessionLifecycleState(session) === 'archived'
}

export function getSessionResumeToken(
    metadata: Session['metadata'] | null | undefined
): string | undefined {
    return getSessionDriverResumeToken(metadata)
}

export function isSessionResumable(session: Pick<Session, 'active' | 'metadata'>): boolean {
    return getSessionLifecycleState(session) !== 'archived'
        && getSessionResumeToken(session.metadata) !== undefined
}
