type SessionLifecycleMetadataField = 'lifecycleState' | 'lifecycleStateSince' | 'archivedBy' | 'archiveReason'
type UserOwnedSessionMetadataField = 'name'

const PROTECTED_SESSION_LIFECYCLE_METADATA_FIELDS: readonly SessionLifecycleMetadataField[] = [
    'lifecycleState',
    'lifecycleStateSince',
    'archivedBy',
    'archiveReason',
]
const USER_OWNED_SESSION_METADATA_FIELDS: readonly UserOwnedSessionMetadataField[] = ['name']

export function mergeRuntimeMetadataWithSessionOwnedFields(currentMetadata: unknown, nextMetadata: unknown): unknown {
    if (!isRecord(currentMetadata) || !isRecord(nextMetadata)) return nextMetadata

    const mergedMetadata: Record<string, unknown> = { ...nextMetadata }

    for (const field of USER_OWNED_SESSION_METADATA_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(currentMetadata, field)) mergedMetadata[field] = currentMetadata[field]
    }

    for (const field of PROTECTED_SESSION_LIFECYCLE_METADATA_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(currentMetadata, field)) {
            mergedMetadata[field] = currentMetadata[field]
        } else {
            delete mergedMetadata[field]
        }
    }

    return mergedMetadata
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}
