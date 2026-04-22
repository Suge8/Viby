import type { ClientToServerEvents } from '@viby/protocol'
import type { CodexCollaborationMode, PermissionMode, Session } from '@viby/protocol/types'
import { z } from 'zod'
import type { Store, StoredSession } from '../../../store'
import type { SessionStreamManager } from '../../../sync/sessionStreamManager'
import type { SyncEvent } from '../../../sync/syncEngine'
import type { AccessErrorReason, AccessResult } from './types'

export type SessionAlivePayload = {
    sid: string
    time: number
    thinking?: boolean
    mode?: 'local' | 'remote'
    permissionMode?: PermissionMode
    model?: string | null
    modelReasoningEffort?: Session['modelReasoningEffort']
    collaborationMode?: CodexCollaborationMode
}

export type SessionEndPayload = {
    sid: string
    time: number
}

export type ResolveSessionAccess = (sessionId: string) => AccessResult<StoredSession>

export type EmitAccessError = (scope: 'session' | 'machine', id: string, reason: AccessErrorReason) => void

export type UpdateMetadataHandler = ClientToServerEvents['update-metadata']
export type UpdateStateHandler = ClientToServerEvents['update-state']
export type CommandCapabilitiesInvalidatedHandler = ClientToServerEvents['command-capabilities-invalidated']

export const messageSchema = z.object({
    sid: z.string(),
    message: z.union([z.string(), z.unknown()]),
    localId: z.string().optional(),
})

export const updateMetadataSchema = z.object({
    sid: z.string(),
    expectedVersion: z.number().int(),
    metadata: z.unknown(),
    touchUpdatedAt: z.boolean().optional(),
})

export const updateStateSchema = z.object({
    sid: z.string(),
    expectedVersion: z.number().int(),
    agentState: z.unknown().nullable(),
})

export const commandCapabilitiesInvalidatedSchema = z.object({
    sid: z.string(),
})

type SessionLifecycleMetadataField = 'lifecycleState' | 'lifecycleStateSince' | 'archivedBy' | 'archiveReason'

const PROTECTED_SESSION_LIFECYCLE_METADATA_FIELDS: readonly SessionLifecycleMetadataField[] = [
    'lifecycleState',
    'lifecycleStateSince',
    'archivedBy',
    'archiveReason',
]

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

export function parseMessageContent(raw: unknown): unknown {
    if (typeof raw !== 'string') {
        return raw
    }

    try {
        return JSON.parse(raw) as unknown
    } catch {
        return raw
    }
}

export function mergeSessionMetadataPreservingLifecycle(currentMetadata: unknown, nextMetadata: unknown): unknown {
    if (!isRecord(currentMetadata) || !isRecord(nextMetadata)) {
        return nextMetadata
    }

    const mergedMetadata: Record<string, unknown> = { ...nextMetadata }

    for (const field of PROTECTED_SESSION_LIFECYCLE_METADATA_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(currentMetadata, field)) {
            delete mergedMetadata[field]
            continue
        }

        mergedMetadata[field] = currentMetadata[field]
    }

    return mergedMetadata
}

export type SessionHandlersDeps = {
    store: Store
    sessionStreamManager: SessionStreamManager
    resolveSessionAccess: ResolveSessionAccess
    emitAccessError: EmitAccessError
    onSessionAlive?: (payload: SessionAlivePayload) => void
    onSessionEnd?: (payload: SessionEndPayload) => void
    onWebappEvent?: (event: SyncEvent) => void
}
