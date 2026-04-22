import type { Database } from 'bun:sqlite'
import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode } from '@viby/protocol/types'
import { type DbSessionRow, getSessionRow, toStoredSession } from './sessionRecordSupport'
import type { StoredSession } from './types'

function updateSessionField(db: Database, query: string, params: Record<string, string | number | null>): boolean {
    try {
        const result = db.query(query).run(params)
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

    return updateSessionField(
        db,
        `
        UPDATE sessions
        SET model = @model,
            updated_at = CASE WHEN @touch_updated_at = 1 THEN @updated_at ELSE updated_at END,
            seq = seq + 1
        WHERE id = @id
          AND model IS NOT @model
    `,
        {
            id,
            model,
            updated_at: now,
            touch_updated_at: touchUpdatedAt ? 1 : 0,
        }
    )
}

export function setSessionModelReasoningEffort(
    db: Database,
    id: string,
    modelReasoningEffort: ModelReasoningEffort | null,
    options?: { touchUpdatedAt?: boolean }
): boolean {
    const now = Date.now()
    const touchUpdatedAt = options?.touchUpdatedAt === true

    return updateSessionField(
        db,
        `
        UPDATE sessions
        SET model_reasoning_effort = @model_reasoning_effort,
            updated_at = CASE WHEN @touch_updated_at = 1 THEN @updated_at ELSE updated_at END,
            seq = seq + 1
        WHERE id = @id
          AND model_reasoning_effort IS NOT @model_reasoning_effort
    `,
        {
            id,
            model_reasoning_effort: modelReasoningEffort,
            updated_at: now,
            touch_updated_at: touchUpdatedAt ? 1 : 0,
        }
    )
}

export function setSessionPermissionMode(db: Database, id: string, permissionMode: PermissionMode | null): boolean {
    return updateSessionField(
        db,
        `
        UPDATE sessions
        SET permission_mode = @permission_mode,
            seq = seq + 1
        WHERE id = @id
          AND permission_mode IS NOT @permission_mode
    `,
        {
            id,
            permission_mode: permissionMode,
        }
    )
}

export function setSessionCollaborationMode(
    db: Database,
    id: string,
    collaborationMode: CodexCollaborationMode | null
): boolean {
    return updateSessionField(
        db,
        `
        UPDATE sessions
        SET collaboration_mode = @collaboration_mode,
            seq = seq + 1
        WHERE id = @id
          AND collaboration_mode IS NOT @collaboration_mode
    `,
        {
            id,
            collaboration_mode: collaborationMode,
        }
    )
}

export function touchSessionUpdatedAt(db: Database, id: string, updatedAt: number): boolean {
    return updateSessionField(
        db,
        `
        UPDATE sessions
        SET updated_at = @updated_at,
            seq = seq + 1
        WHERE id = @id
          AND updated_at < @updated_at
    `,
        {
            id,
            updated_at: updatedAt,
        }
    )
}

export function getSession(db: Database, id: string): StoredSession | null {
    const row = getSessionRow(db, id) ?? undefined
    return row ? toStoredSession(row) : null
}

export function getSessions(db: Database): StoredSession[] {
    const rows = db.query('SELECT * FROM sessions ORDER BY updated_at DESC').all() as DbSessionRow[]
    return rows.map(toStoredSession)
}

export function getInactiveRunningSessionIds(db: Database): string[] {
    const rows = db
        .query(`
        SELECT id
        FROM sessions
        WHERE active = 0
          AND json_extract(metadata, '$.lifecycleState') = 'running'
    `)
        .all() as Array<{ id: string }>

    return rows.map((row) => row.id)
}

export function deleteSession(db: Database, id: string): boolean {
    const result = db.query('DELETE FROM sessions WHERE id = ?').run(id)
    return result.changes > 0
}
