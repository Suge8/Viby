import type { Metadata, Session } from './schemas'
import { getSessionDriverResumeToken } from './sessionDriver'
import { resolveSessionResumeState, type SessionResumeState } from './sessionResume'

export const SESSION_LIFECYCLE_STATES = ['running', 'open', 'closed', 'archived'] as const

export type SessionLifecycleState = (typeof SESSION_LIFECYCLE_STATES)[number]

const SESSION_LIFECYCLE_RANK: Record<SessionLifecycleState, number> = {
    running: 0,
    open: 1,
    closed: 2,
    archived: 3,
}

type SessionLifecycleSource = {
    active: boolean
    metadata: Pick<Metadata, 'lifecycleState'> | null
}

type SessionInteractivitySource = Pick<Session, 'active' | 'metadata'> & {
    resumeAvailable?: boolean
    resumeState?: SessionResumeState
}

type SessionInteractionGate = {
    active: boolean
    allowSendWhenInactive: boolean
}

export type SessionInteractivityState = {
    lifecycleState: SessionLifecycleState
    resumeAvailable: boolean
    allowSendWhenInactive: boolean
    retryAvailable: boolean
}

export type SessionLifecyclePatch = {
    active?: boolean
    activeAt?: number
    updatedAt?: number
    lifecycleStateHint?: SessionLifecycleState
    lifecycleStateSinceHint?: number
}

export type SessionLifecyclePatchResolution = {
    lifecycleState: SessionLifecycleState
    lifecycleStateSince: number | null
}

export function isSessionLifecycleState(value: unknown): value is SessionLifecycleState {
    return typeof value === 'string' && SESSION_LIFECYCLE_STATES.includes(value as SessionLifecycleState)
}

export function resolveInactiveSessionLifecycleState(
    lifecycleState: SessionLifecycleState | null | undefined
): Exclude<SessionLifecycleState, 'running'> {
    if (lifecycleState === 'archived') {
        return 'archived'
    }

    if (lifecycleState === 'open') {
        return 'open'
    }

    return 'closed'
}

export function isSessionArchivedLifecycleState(lifecycleState: SessionLifecycleState): boolean {
    return lifecycleState === 'archived'
}

export function getSessionLifecycleRank(lifecycleState: SessionLifecycleState): number {
    return SESSION_LIFECYCLE_RANK[lifecycleState]
}

export function isSessionHistoryLifecycleState(lifecycleState: SessionLifecycleState): boolean {
    return lifecycleState === 'closed' || lifecycleState === 'archived'
}

export function isSessionRunningSectionLifecycleState(lifecycleState: SessionLifecycleState): boolean {
    return lifecycleState === 'running' || lifecycleState === 'open'
}

export function getSessionLifecycleState(session: SessionLifecycleSource): SessionLifecycleState {
    if (session.active) {
        return 'running'
    }

    return resolveInactiveSessionLifecycleState(session.metadata?.lifecycleState)
}

export function resolveSessionLifecyclePatch(options: {
    currentLifecycleState: SessionLifecycleState
    currentLifecycleStateSince: number | null
    currentActive: boolean
    currentActiveAt: number
    currentUpdatedAt: number
    patch: SessionLifecyclePatch
}): SessionLifecyclePatchResolution {
    const nextLifecycleState = resolvePatchedSessionLifecycleState(
        options.currentLifecycleState,
        options.currentActive,
        options.patch
    )

    return {
        lifecycleState: nextLifecycleState,
        lifecycleStateSince: resolvePatchedSessionLifecycleStateSince(
            options.currentLifecycleState,
            options.currentLifecycleStateSince,
            nextLifecycleState,
            options.currentActiveAt,
            options.currentUpdatedAt,
            options.patch
        ),
    }
}

export function isSessionArchived(session: SessionLifecycleSource): boolean {
    return isSessionArchivedLifecycleState(getSessionLifecycleState(session))
}

export function getSessionResumeToken(metadata: Session['metadata'] | null | undefined): string | undefined {
    return getSessionDriverResumeToken(metadata)
}

export function resolveSessionInteractivity(session: SessionInteractivitySource): SessionInteractivityState {
    const lifecycleState = getSessionLifecycleState(session)
    const resumeState =
        session.resumeState ??
        resolveSessionResumeState({
            metadata: session.metadata,
            resumeAvailableHint: session.resumeAvailable,
        })
    const { resumeAvailable } = resumeState
    const allowSendWhenInactive = lifecycleState !== 'running' && resumeAvailable

    return {
        lifecycleState,
        resumeAvailable,
        allowSendWhenInactive,
        retryAvailable: session.active || resumeAvailable,
    }
}

export function isSessionInteractionDisabled(options: SessionInteractionGate): boolean {
    return !options.active && !options.allowSendWhenInactive
}

export function isSessionResumable(session: Pick<Session, 'active' | 'metadata'>): boolean {
    const { lifecycleState, resumeAvailable } = resolveSessionInteractivity(session)
    return lifecycleState !== 'archived' && resumeAvailable
}

function resolvePatchedSessionLifecycleState(
    currentLifecycleState: SessionLifecycleState,
    currentActive: boolean,
    patch: SessionLifecyclePatch
): SessionLifecycleState {
    if (patch.active === true) {
        return 'running'
    }

    if (patch.lifecycleStateHint) {
        if (patch.lifecycleStateHint === 'open' && patch.active !== false && currentActive) {
            return 'running'
        }

        return patch.lifecycleStateHint
    }

    if (patch.active === false) {
        return resolveInactiveSessionLifecycleState(currentLifecycleState)
    }

    return currentLifecycleState
}

function resolvePatchedSessionLifecycleStateSince(
    currentLifecycleState: SessionLifecycleState,
    currentLifecycleStateSince: number | null,
    nextLifecycleState: SessionLifecycleState,
    currentActiveAt: number,
    currentUpdatedAt: number,
    patch: SessionLifecyclePatch
): number | null {
    if (patch.lifecycleStateSinceHint !== undefined) {
        return patch.lifecycleStateSinceHint
    }

    if (nextLifecycleState === currentLifecycleState) {
        return currentLifecycleStateSince
    }

    if (patch.active === true) {
        return patch.activeAt ?? patch.updatedAt ?? currentActiveAt ?? currentUpdatedAt
    }

    if (patch.active === false) {
        return patch.updatedAt ?? currentUpdatedAt
    }

    return currentLifecycleStateSince
}
