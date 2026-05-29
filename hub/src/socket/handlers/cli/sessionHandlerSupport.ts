import { type ClientToServerEvents, SessionRuntimeStatePayloadSchema } from '@viby/protocol'
import { AgentStateSchema } from '@viby/protocol/schemas'
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

export type SessionRuntimeStatePayload = ClientToServerEvents extends {
    'session-runtime-state': (payload: infer TPayload) => void
}
    ? TPayload
    : never

export type ResolveSessionAccess = (sessionId: string) => AccessResult<StoredSession>

export type EmitAccessError = (scope: 'session' | 'machine', id: string, reason: AccessErrorReason) => void

export type UpdateMetadataHandler = ClientToServerEvents['update-metadata']
export type UpdateStateHandler = ClientToServerEvents['update-state']
export type CommandCapabilitiesInvalidatedHandler = ClientToServerEvents['command-capabilities-invalidated']
export type MessagesConsumedHandler = ClientToServerEvents['messages-consumed']
export type MessagesCanceledHandler = ClientToServerEvents['messages-canceled']
export type SessionRuntimeStateHandler = ClientToServerEvents['session-runtime-state']

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
    agentState: AgentStateSchema.nullable(),
})

export const commandCapabilitiesInvalidatedSchema = z.object({
    sid: z.string(),
})

export const queuedMessageLocalIdsSchema = z.object({
    sid: z.string(),
    localIds: z.array(z.string()),
})

export const sessionRuntimeStateSchema = SessionRuntimeStatePayloadSchema

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
    onSessionRuntimeState?: (payload: SessionRuntimeStatePayload) => void
    onWebappEvent?: (event: SyncEvent) => void
}
