import type { Machine, Session } from '@/types/api'

export type SessionPatch = Partial<
    Pick<
        Session,
        'active' | 'thinking' | 'activeAt' | 'updatedAt' | 'model' | 'modelReasoningEffort' | 'permissionMode' | 'collaborationMode'
    >
> & {
    lifecycleStateHint?: NonNullable<Session['metadata']>['lifecycleState']
    lifecycleStateSinceHint?: NonNullable<Session['metadata']>['lifecycleStateSince']
}

export function isArchivedKeepalivePatch(
    lifecycleState: SessionPatch['lifecycleStateHint'] | null | undefined,
    patch: SessionPatch
): boolean {
    return lifecycleState === 'archived'
        && patch.lifecycleStateHint === undefined
        && patch.active === true
}

function hasRecordShape(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function getLifecycleMetadataPatch(
    value: unknown
): Pick<SessionPatch, 'lifecycleStateHint' | 'lifecycleStateSinceHint'> | null {
    if (!hasRecordShape(value)) {
        return null
    }

    const metadata = value.metadata
    if (!hasRecordShape(metadata)) {
        return null
    }

    const patch: Pick<SessionPatch, 'lifecycleStateHint' | 'lifecycleStateSinceHint'> = {}
    let hasLifecyclePatch = false

    if (
        metadata.lifecycleState === 'running'
        || metadata.lifecycleState === 'closed'
        || metadata.lifecycleState === 'archived'
    ) {
        patch.lifecycleStateHint = metadata.lifecycleState
        hasLifecyclePatch = true
    }

    if (typeof metadata.lifecycleStateSince === 'number') {
        patch.lifecycleStateSinceHint = metadata.lifecycleStateSince
        hasLifecyclePatch = true
    }

    return hasLifecyclePatch ? patch : null
}

export function isSessionRecord(value: unknown): value is Session {
    if (!hasRecordShape(value)) {
        return false
    }
    return typeof value.id === 'string'
        && typeof value.active === 'boolean'
        && typeof value.activeAt === 'number'
        && typeof value.updatedAt === 'number'
        && typeof value.thinking === 'boolean'
}

export function getSessionPatch(value: unknown): SessionPatch | null {
    if (!hasRecordShape(value)) {
        return null
    }

    const patch: SessionPatch = {}
    let hasKnownPatch = false

    if (typeof value.active === 'boolean') {
        patch.active = value.active
        hasKnownPatch = true
    }
    if (typeof value.thinking === 'boolean') {
        patch.thinking = value.thinking
        hasKnownPatch = true
    }
    if (typeof value.activeAt === 'number') {
        patch.activeAt = value.activeAt
        hasKnownPatch = true
    }
    if (typeof value.updatedAt === 'number') {
        patch.updatedAt = value.updatedAt
        hasKnownPatch = true
    }
    if (value.model === null || typeof value.model === 'string') {
        patch.model = value.model
        hasKnownPatch = true
    }
    if (value.modelReasoningEffort === null || typeof value.modelReasoningEffort === 'string') {
        patch.modelReasoningEffort = value.modelReasoningEffort as Session['modelReasoningEffort']
        hasKnownPatch = true
    }
    if (typeof value.permissionMode === 'string') {
        patch.permissionMode = value.permissionMode as Session['permissionMode']
        hasKnownPatch = true
    }
    if (typeof value.collaborationMode === 'string') {
        patch.collaborationMode = value.collaborationMode as Session['collaborationMode']
        hasKnownPatch = true
    }

    const lifecyclePatch = getLifecycleMetadataPatch(value)
    if (lifecyclePatch) {
        Object.assign(patch, lifecyclePatch)
        hasKnownPatch = true
    }

    return hasKnownPatch ? patch : null
}

export function hasUnknownSessionPatchKeys(value: unknown): boolean {
    if (!hasRecordShape(value)) {
        return false
    }

    const knownKeys = new Set([
        'active',
        'thinking',
        'activeAt',
        'updatedAt',
        'model',
        'modelReasoningEffort',
        'permissionMode',
        'collaborationMode',
        'metadata'
    ])

    return Object.entries(value).some(([key, nestedValue]) => {
        if (!knownKeys.has(key)) {
            return true
        }

        if (key !== 'metadata') {
            return false
        }

        if (!hasRecordShape(nestedValue)) {
            return true
        }

        return Object.keys(nestedValue).some((nestedKey) => (
            nestedKey !== 'lifecycleState' && nestedKey !== 'lifecycleStateSince'
        ))
    })
}

function isMachineMetadata(value: unknown): value is Machine['metadata'] {
    if (value === null) {
        return true
    }
    if (!hasRecordShape(value)) {
        return false
    }
    return typeof value.host === 'string'
        && typeof value.platform === 'string'
        && typeof value.vibyCliVersion === 'string'
}

export function isMachineRecord(value: unknown): value is Machine {
    if (!hasRecordShape(value)) {
        return false
    }
    return typeof value.id === 'string'
        && typeof value.active === 'boolean'
        && isMachineMetadata(value.metadata)
}

export function isInactiveMachinePatch(value: unknown): boolean {
    return hasRecordShape(value) && value.active === false
}

export function isMachineRefreshOnlyPayload(value: unknown): boolean {
    return !hasRecordShape(value) || typeof value.activeAt !== 'number'
}
