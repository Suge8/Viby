import { isSessionArchivedLifecycleState } from '@viby/protocol'
import type { Session } from '@viby/protocol/types'
import type { Store } from '../store'

export type InactiveLifecyclePatch =
    | Pick<NonNullable<Session['metadata']>, 'lifecycleState' | 'lifecycleStateSince'>
    | undefined

export type SessionPresencePatch = Omit<Partial<Session>, 'metadata'> & {
    metadata?: InactiveLifecyclePatch
}

export type PresenceConfigSnapshot = Pick<
    Session,
    'permissionMode' | 'model' | 'modelReasoningEffort' | 'collaborationMode'
>

export type AlivePresencePayload = {
    permissionMode?: Session['permissionMode']
    model?: string | null
    modelReasoningEffort?: Session['modelReasoningEffort']
    collaborationMode?: Session['collaborationMode']
}

export function isPresenceBlockedByArchivedLifecycle(session: Session | null | undefined): boolean {
    return Boolean(
        session?.metadata?.lifecycleState && isSessionArchivedLifecycleState(session.metadata.lifecycleState)
    )
}

export function capturePresenceConfig(
    session: Pick<Session, 'permissionMode' | 'model' | 'modelReasoningEffort' | 'collaborationMode'>
): PresenceConfigSnapshot {
    return {
        permissionMode: session.permissionMode,
        model: session.model,
        modelReasoningEffort: session.modelReasoningEffort,
        collaborationMode: session.collaborationMode,
    }
}

export function hasPresenceConfigChanged(
    previousConfig: PresenceConfigSnapshot,
    currentConfig: PresenceConfigSnapshot
): boolean {
    return (
        previousConfig.permissionMode !== currentConfig.permissionMode ||
        previousConfig.model !== currentConfig.model ||
        previousConfig.modelReasoningEffort !== currentConfig.modelReasoningEffort ||
        previousConfig.collaborationMode !== currentConfig.collaborationMode
    )
}

export function applyAlivePresenceConfig(options: {
    store: Store
    sessionId: string
    session: Pick<Session, 'permissionMode' | 'model' | 'modelReasoningEffort' | 'collaborationMode'>
    payload: AlivePresencePayload
}): PresenceConfigSnapshot {
    const previousConfig = capturePresenceConfig(options.session)

    if (options.payload.permissionMode !== undefined) {
        if (options.payload.permissionMode !== options.session.permissionMode) {
            options.store.sessions.setSessionPermissionMode(options.sessionId, options.payload.permissionMode)
        }
        options.session.permissionMode = options.payload.permissionMode
    }

    if (options.payload.model !== undefined) {
        if (options.payload.model !== options.session.model) {
            options.store.sessions.setSessionModel(options.sessionId, options.payload.model, {
                touchUpdatedAt: false,
            })
        }
        options.session.model = options.payload.model
    }

    if (options.payload.modelReasoningEffort !== undefined) {
        if (options.payload.modelReasoningEffort !== options.session.modelReasoningEffort) {
            options.store.sessions.setSessionModelReasoningEffort(
                options.sessionId,
                options.payload.modelReasoningEffort,
                {
                    touchUpdatedAt: false,
                }
            )
        }
        options.session.modelReasoningEffort = options.payload.modelReasoningEffort
    }

    if (options.payload.collaborationMode !== undefined) {
        if (options.payload.collaborationMode !== options.session.collaborationMode) {
            options.store.sessions.setSessionCollaborationMode(options.sessionId, options.payload.collaborationMode)
        }
        options.session.collaborationMode = options.payload.collaborationMode
    }

    return previousConfig
}

export function shouldBroadcastAlivePresence(options: {
    wasActive: boolean
    currentActive: boolean
    wasThinking: boolean
    currentThinking: boolean
    now: number
    lastBroadcastAt: number
    broadcastThrottleMs: number
    previousConfig: PresenceConfigSnapshot
    currentConfig: PresenceConfigSnapshot
}): boolean {
    return (
        (!options.wasActive && options.currentActive) ||
        options.wasThinking !== options.currentThinking ||
        hasPresenceConfigChanged(options.previousConfig, options.currentConfig) ||
        options.now - options.lastBroadcastAt > options.broadcastThrottleMs
    )
}

export function buildAlivePresencePatch(
    session: Pick<
        Session,
        'activeAt' | 'thinking' | 'permissionMode' | 'model' | 'modelReasoningEffort' | 'collaborationMode'
    >
): SessionPresencePatch {
    return {
        active: true,
        activeAt: session.activeAt,
        thinking: session.thinking,
        permissionMode: session.permissionMode,
        model: session.model,
        modelReasoningEffort: session.modelReasoningEffort,
        collaborationMode: session.collaborationMode,
    }
}

export function buildInactivePresencePatch(lifecyclePatch: InactiveLifecyclePatch): SessionPresencePatch {
    return {
        active: false,
        thinking: false,
        metadata: lifecyclePatch,
    }
}
