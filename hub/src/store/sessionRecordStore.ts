import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode } from '@viby/protocol/types'
import { safeJsonParse } from './json'
import { getSession } from './sessionRecordFieldStore'

export {
    deleteSession,
    getInactiveRunningSessionIds,
    getSession,
    getSessions,
    setSessionCollaborationMode,
    setSessionModel,
    setSessionModelReasoningEffort,
    setSessionPermissionMode,
    touchSessionUpdatedAt,
} from './sessionRecordFieldStore'

import { type DbSessionRow, getSessionRow, normalizeSessionMetadata, toStoredSession } from './sessionRecordSupport'
import type { StoredSession, VersionedUpdateResult } from './types'
import { updateVersionedField } from './versionedUpdates'

export type CreateStoredSessionInput = {
    tag: string
    metadata: unknown
    agentState?: unknown
    model?: string
    modelReasoningEffort?: ModelReasoningEffort
    permissionMode?: PermissionMode
    collaborationMode?: CodexCollaborationMode
    sessionId?: string
    createdAt?: number
    updatedAt?: number
}

function serializeNullableJson(value: unknown): string | null {
    return value === null || value === undefined ? null : JSON.stringify(value)
}

export function getOrCreateSession(db: Database, input: CreateStoredSessionInput): StoredSession {
    const { tag, metadata, agentState, model, modelReasoningEffort, permissionMode, collaborationMode, sessionId } =
        input
    const normalizedMetadata = normalizeSessionMetadata(metadata)

    if (sessionId) {
        const existingById = getSessionRow(db, sessionId)
        if (existingById) {
            return toStoredSession(existingById)
        }
    }

    const existing = db.query('SELECT * FROM sessions WHERE tag = ? ORDER BY created_at DESC LIMIT 1').get(tag) as
        | DbSessionRow
        | undefined
    if (existing) {
        return toStoredSession(existing)
    }

    const createdAt = input.createdAt ?? Date.now()
    const updatedAt = input.updatedAt ?? createdAt
    const id = sessionId ?? randomUUID()
    const metadataJson = JSON.stringify(normalizedMetadata)
    const agentStateJson = serializeNullableJson(agentState)

    db.query(`
        INSERT INTO sessions (
            id, tag, machine_id, created_at, updated_at,
            metadata, metadata_version,
            agent_state, agent_state_version,
            model,
            model_reasoning_effort,
            permission_mode,
            collaboration_mode,
            next_message_seq,
            todos, todos_updated_at,
            latest_activity_at, latest_activity_kind, latest_completed_reply_at,
            active, active_at, seq
        ) VALUES (
            @id, @tag, NULL, @created_at, @updated_at,
            @metadata, 1,
            @agent_state, 1,
            @model,
            @model_reasoning_effort,
            @permission_mode,
            @collaboration_mode,
            1,
            NULL, NULL,
            NULL, NULL, NULL,
            0, NULL, 0
        )
    `).run({
        id,
        tag,
        created_at: createdAt,
        updated_at: updatedAt,
        metadata: metadataJson,
        agent_state: agentStateJson,
        model: model ?? null,
        model_reasoning_effort: modelReasoningEffort ?? null,
        permission_mode: permissionMode ?? null,
        collaboration_mode: collaborationMode ?? null,
    })

    const row = getSession(db, id)
    if (!row) {
        throw new Error('Failed to create session')
    }
    return row
}

export function updateSessionMetadata(
    db: Database,
    id: string,
    metadata: unknown,
    expectedVersion: number,
    options?: { touchUpdatedAt?: boolean }
): VersionedUpdateResult<unknown | null> {
    const now = Date.now()
    const touchUpdatedAt = options?.touchUpdatedAt !== false

    return updateVersionedField({
        db,
        table: 'sessions',
        id,
        field: 'metadata',
        versionField: 'metadata_version',
        expectedVersion,
        value: normalizeSessionMetadata(metadata),
        encode: (value) => {
            const json = JSON.stringify(normalizeSessionMetadata(value))
            return json === undefined ? null : json
        },
        decode: safeJsonParse,
        setClauses: [
            'updated_at = CASE WHEN @touch_updated_at = 1 THEN @updated_at ELSE updated_at END',
            'seq = seq + 1',
        ],
        params: {
            updated_at: now,
            touch_updated_at: touchUpdatedAt ? 1 : 0,
        },
    })
}

export function updateSessionAgentState(
    db: Database,
    id: string,
    agentState: unknown,
    expectedVersion: number
): VersionedUpdateResult<unknown | null> {
    const normalized = agentState ?? null

    return updateVersionedField({
        db,
        table: 'sessions',
        id,
        field: 'agent_state',
        versionField: 'agent_state_version',
        expectedVersion,
        value: normalized,
        encode: (value) => (value === null ? null : JSON.stringify(value)),
        decode: safeJsonParse,
        setClauses: ['seq = seq + 1'],
    })
}

export function setSessionTodos(db: Database, id: string, todos: unknown, todosUpdatedAt: number): boolean {
    try {
        const result = db
            .query(`
            UPDATE sessions
            SET todos = @todos,
                todos_updated_at = @todos_updated_at,
                seq = seq + 1
            WHERE id = @id
              AND (todos_updated_at IS NULL OR todos_updated_at < @todos_updated_at)
        `)
            .run({
                id,
                todos: serializeNullableJson(todos),
                todos_updated_at: todosUpdatedAt,
            })

        return result.changes === 1
    } catch {
        return false
    }
}

export function setSessionAlive(db: Database, id: string, activeAt: number): boolean {
    try {
        const result = db
            .query(`
            UPDATE sessions
            SET active = 1,
                active_at = @active_at
            WHERE id = @id
              AND (active != 1 OR active_at IS NULL OR active_at < @active_at)
        `)
            .run({
                id,
                active_at: activeAt,
            })

        return result.changes === 1
    } catch {
        return false
    }
}

export function setSessionInactive(db: Database, id: string): boolean {
    try {
        const result = db
            .query(`
            UPDATE sessions
            SET active = 0
            WHERE id = @id
              AND active != 0
        `)
            .run({ id })

        return result.changes === 1
    } catch {
        return false
    }
}

function updateSessionField(db: Database, query: string, params: Record<string, string | number | null>): boolean {
    try {
        const result = db.query(query).run(params)
        return result.changes === 1
    } catch {
        return false
    }
}
