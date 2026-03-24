import type { Metadata, Session } from './schemas'

export const SESSION_LIFECYCLE_STATES = ['running', 'closed', 'archived'] as const

export type SessionLifecycleState = (typeof SESSION_LIFECYCLE_STATES)[number]

type SessionResumeMetadata = Pick<
    Metadata,
    'flavor' | 'claudeSessionId' | 'codexSessionId' | 'geminiSessionId' | 'opencodeSessionId' | 'cursorSessionId'
>

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
    metadata: SessionResumeMetadata | null | undefined
): string | undefined {
    if (!metadata) {
        return undefined
    }

    switch (metadata.flavor) {
        case 'codex':
            return metadata.codexSessionId
        case 'gemini':
            return metadata.geminiSessionId
        case 'opencode':
            return metadata.opencodeSessionId
        case 'cursor':
            return metadata.cursorSessionId
        case 'claude':
        case null:
        case undefined:
        default:
            return metadata.claudeSessionId
    }
}

export function isSessionResumable(session: Pick<Session, 'active' | 'metadata'>): boolean {
    return getSessionLifecycleState(session) !== 'archived'
        && getSessionResumeToken(session.metadata) !== undefined
}
