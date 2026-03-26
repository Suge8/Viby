import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import type {
    CodexCollaborationMode,
    ModelReasoningEffort,
    PermissionMode
} from '@viby/protocol/types'

import { safeJsonParse } from './json'
import type { StoredSession, VersionedUpdateResult } from './types'
import { updateVersionedField } from './versionedUpdates'

type DbSessionRow = {
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
    team_state: string | null
    team_state_updated_at: number | null
    active: number
    active_at: number | null
    seq: number
}

function toStoredSession(row: DbSessionRow): StoredSession {
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
        teamState: safeJsonParse(row.team_state),
        teamStateUpdatedAt: row.team_state_updated_at,
        active: row.active === 1,
        activeAt: row.active_at,
        seq: row.seq
    }
}

export type CreateStoredSessionInput = {
    tag: string
    metadata: unknown
    agentState?: unknown
    model?: string
    modelReasoningEffort?: ModelReasoningEffort
    permissionMode?: PermissionMode
    collaborationMode?: CodexCollaborationMode
    sessionId?: string
}

export function getOrCreateSession(
    db: Database,
    input: CreateStoredSessionInput
): StoredSession {
    const {
        tag,
        metadata,
        agentState,
        model,
        modelReasoningEffort,
        permissionMode,
        collaborationMode,
        sessionId
    } = input

    if (sessionId) {
        const existingById = getSession(db, sessionId)
        if (existingById) {
            return existingById
        }
    }

    const existing = db.query(
        'SELECT * FROM sessions WHERE tag = ? ORDER BY created_at DESC LIMIT 1'
    ).get(tag) as DbSessionRow | undefined
    if (existing) {
        return toStoredSession(existing)
    }

    const now = Date.now()
    const id = sessionId ?? randomUUID()
    const metadataJson = JSON.stringify(metadata)
    const agentStateJson = agentState === null || agentState === undefined ? null : JSON.stringify(agentState)

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
            0, NULL, 0
        )
    `).run({
        id,
        tag,
        created_at: now,
        updated_at: now,
        metadata: metadataJson,
        agent_state: agentStateJson,
        model: model ?? null,
        model_reasoning_effort: modelReasoningEffort ?? null,
        permission_mode: permissionMode ?? null,
        collaboration_mode: collaborationMode ?? null
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
        value: metadata,
        encode: (value) => {
            const json = JSON.stringify(value)
            return json === undefined ? null : json
        },
        decode: safeJsonParse,
        setClauses: [
            'updated_at = CASE WHEN @touch_updated_at = 1 THEN @updated_at ELSE updated_at END',
            'seq = seq + 1'
        ],
        params: {
            updated_at: now,
            touch_updated_at: touchUpdatedAt ? 1 : 0
        }
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
        setClauses: ['seq = seq + 1']
    })
}

export function setSessionTodos(
    db: Database,
    id: string,
    todos: unknown,
    todosUpdatedAt: number
): boolean {
    try {
        const json = todos === null || todos === undefined ? null : JSON.stringify(todos)
        const result = db.query(`
            UPDATE sessions
            SET todos = @todos,
                todos_updated_at = @todos_updated_at,
                seq = seq + 1
            WHERE id = @id
              AND (todos_updated_at IS NULL OR todos_updated_at < @todos_updated_at)
        `).run({
            id,
            todos: json,
            todos_updated_at: todosUpdatedAt
        })

        return result.changes === 1
    } catch {
        return false
    }
}

export function setSessionTeamState(
    db: Database,
    id: string,
    teamState: unknown,
    updatedAt: number
): boolean {
    try {
        const json = teamState === null || teamState === undefined ? null : JSON.stringify(teamState)
        const result = db.query(`
            UPDATE sessions
            SET team_state = @team_state,
                team_state_updated_at = @team_state_updated_at,
                seq = seq + 1
            WHERE id = @id
              AND (team_state_updated_at IS NULL OR team_state_updated_at < @team_state_updated_at)
        `).run({
            id,
            team_state: json,
            team_state_updated_at: updatedAt
        })

        return result.changes === 1
    } catch {
        return false
    }
}

export function setSessionAlive(
    db: Database,
    id: string,
    activeAt: number
): boolean {
    try {
        const result = db.query(`
            UPDATE sessions
            SET active = 1,
                active_at = @active_at
            WHERE id = @id
              AND (active != 1 OR active_at IS NULL OR active_at < @active_at)
        `).run({
            id,
            active_at: activeAt
        })

        return result.changes === 1
    } catch {
        return false
    }
}

export function setSessionInactive(
    db: Database,
    id: string
): boolean {
    try {
        const result = db.query(`
            UPDATE sessions
            SET active = 0
            WHERE id = @id
              AND active != 0
        `).run({ id })

        return result.changes === 1
    } catch {
        return false
    }
}

export function setSessionModel(
    db: Database,
    id: string,
    model: string | null,
    options?: { touchUpdatedAt?: boolean }
): boolean {
    const now = Date.now()
    const touchUpdatedAt = options?.touchUpdatedAt === true

    try {
        const result = db.query(`
            UPDATE sessions
            SET model = @model,
                updated_at = CASE WHEN @touch_updated_at = 1 THEN @updated_at ELSE updated_at END,
                seq = seq + 1
            WHERE id = @id
              AND model IS NOT @model
        `).run({
            id,
            model,
            updated_at: now,
            touch_updated_at: touchUpdatedAt ? 1 : 0
        })

        return result.changes === 1
    } catch {
        return false
    }
}

export function setSessionModelReasoningEffort(
    db: Database,
    id: string,
    modelReasoningEffort: ModelReasoningEffort | null,
    options?: { touchUpdatedAt?: boolean }
): boolean {
    const now = Date.now()
    const touchUpdatedAt = options?.touchUpdatedAt === true

    try {
        const result = db.query(`
            UPDATE sessions
            SET model_reasoning_effort = @model_reasoning_effort,
                updated_at = CASE WHEN @touch_updated_at = 1 THEN @updated_at ELSE updated_at END,
                seq = seq + 1
            WHERE id = @id
              AND model_reasoning_effort IS NOT @model_reasoning_effort
        `).run({
            id,
            model_reasoning_effort: modelReasoningEffort,
            updated_at: now,
            touch_updated_at: touchUpdatedAt ? 1 : 0
        })

        return result.changes === 1
    } catch {
        return false
    }
}

export function setSessionPermissionMode(
    db: Database,
    id: string,
    permissionMode: PermissionMode | null
): boolean {
    try {
        const result = db.query(`
            UPDATE sessions
            SET permission_mode = @permission_mode,
                seq = seq + 1
            WHERE id = @id
              AND permission_mode IS NOT @permission_mode
        `).run({
            id,
            permission_mode: permissionMode
        })

        return result.changes === 1
    } catch {
        return false
    }
}

export function setSessionCollaborationMode(
    db: Database,
    id: string,
    collaborationMode: CodexCollaborationMode | null
): boolean {
    try {
        const result = db.query(`
            UPDATE sessions
            SET collaboration_mode = @collaboration_mode,
                seq = seq + 1
            WHERE id = @id
              AND collaboration_mode IS NOT @collaboration_mode
        `).run({
            id,
            collaboration_mode: collaborationMode
        })

        return result.changes === 1
    } catch {
        return false
    }
}

export function touchSessionUpdatedAt(
    db: Database,
    id: string,
    updatedAt: number
): boolean {
    try {
        const result = db.query(`
            UPDATE sessions
            SET updated_at = @updated_at,
                seq = seq + 1
            WHERE id = @id
              AND updated_at < @updated_at
        `).run({
            id,
            updated_at: updatedAt
        })

        return result.changes === 1
    } catch {
        return false
    }
}

export function getSession(db: Database, id: string): StoredSession | null {
    const row = db.query('SELECT * FROM sessions WHERE id = ?').get(id) as DbSessionRow | undefined
    return row ? toStoredSession(row) : null
}

export function getSessions(db: Database): StoredSession[] {
    const rows = db.query('SELECT * FROM sessions ORDER BY updated_at DESC').all() as DbSessionRow[]
    return rows.map(toStoredSession)
}

export function deleteSession(db: Database, id: string): boolean {
    const result = db.query('DELETE FROM sessions WHERE id = ?').run(id)
    return result.changes > 0
}

export function allocateNextSessionMessageSeq(db: Database, id: string): number {
    const row = db.query(`
        UPDATE sessions
        SET next_message_seq = next_message_seq + 1
        WHERE id = ?
        RETURNING next_message_seq - 1 AS allocated_seq
    `).get(id) as { allocated_seq: number } | undefined

    if (!row) {
        throw new Error(`Session not found: ${id}`)
    }

    return row.allocated_seq
}
