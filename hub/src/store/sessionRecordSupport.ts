import type { Database } from 'bun:sqlite'
import { createEmptySessionMessageActivity, type SessionMessageActivity } from '@viby/protocol'
import type {
    CodexCollaborationMode,
    ModelReasoningEffort,
    PermissionMode,
    SessionActivityKind,
} from '@viby/protocol/types'

import { safeJsonParse } from './json'
import type { StoredSession } from './types'

export type DbSessionRow = {
    id: string
    tag: string | null
    machine_id: string | null
    created_at: number
    updated_at: number
    metadata: string | null
    metadata_version: number
    agent_state: string | null
    agent_state_version: number
    model: string | null
    model_reasoning_effort: ModelReasoningEffort | null
    permission_mode: PermissionMode | null
    collaboration_mode: CodexCollaborationMode | null
    next_message_seq: number
    todos: string | null
    todos_updated_at: number | null
    latest_activity_at: number | null
    latest_activity_kind: SessionActivityKind | null
    latest_completed_reply_at: number | null
    active: number
    active_at: number | null
    seq: number
}

export function createEmptyStoredSessionMessageActivity(): SessionMessageActivity {
    return createEmptySessionMessageActivity()
}

export function normalizeSessionMetadata(metadata: unknown): unknown {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return metadata
    }

    const record = metadata as Record<string, unknown>
    if (typeof record.flavor === 'string') {
        throw new Error('Legacy session metadata flavor is no longer supported; write metadata.driver instead')
    }
    return metadata
}

export function getSessionRow(db: Database, id: string): DbSessionRow | null {
    return (db.query('SELECT * FROM sessions WHERE id = ?').get(id) as DbSessionRow | undefined) ?? null
}

export function toStoredSession(row: DbSessionRow): StoredSession {
    return {
        id: row.id,
        tag: row.tag,
        machineId: row.machine_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: safeJsonParse(row.metadata),
        metadataVersion: row.metadata_version,
        agentState: safeJsonParse(row.agent_state),
        agentStateVersion: row.agent_state_version,
        model: row.model,
        modelReasoningEffort: row.model_reasoning_effort,
        permissionMode: row.permission_mode,
        collaborationMode: row.collaboration_mode,
        todos: safeJsonParse(row.todos),
        todosUpdatedAt: row.todos_updated_at,
        latestActivityAt: row.latest_activity_at,
        latestActivityKind: row.latest_activity_kind,
        latestCompletedReplyAt: row.latest_completed_reply_at,
        active: row.active === 1,
        activeAt: row.active_at,
        seq: row.seq,
    }
}

export function buildSessionMessageActivity(
    row: Pick<DbSessionRow, 'latest_activity_at' | 'latest_activity_kind' | 'latest_completed_reply_at'>
): SessionMessageActivity {
    return {
        latestActivityAt: row.latest_activity_at,
        latestActivityKind: row.latest_activity_kind,
        latestCompletedReplyAt: row.latest_completed_reply_at,
    }
}
