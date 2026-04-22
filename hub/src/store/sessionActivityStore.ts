import type { Database } from 'bun:sqlite'
import {
    mergeSessionMessageActivity as mergeProtocolSessionMessageActivity,
    type SessionMessageActivity,
} from '@viby/protocol'

import {
    buildSessionMessageActivity,
    createEmptyStoredSessionMessageActivity,
    type DbSessionRow,
    getSessionRow,
} from './sessionRecordSupport'

export function getSessionMessageActivities(
    db: Database,
    sessionIds: string[]
): Record<string, SessionMessageActivity> {
    const result = Object.fromEntries(
        sessionIds.map((sessionId) => [sessionId, createEmptyStoredSessionMessageActivity()])
    ) as Record<string, SessionMessageActivity>

    if (sessionIds.length === 0) {
        return result
    }

    const placeholders = sessionIds.map(() => '?').join(', ')
    const rows = db
        .query(
            `
            SELECT id, latest_activity_at, latest_activity_kind, latest_completed_reply_at
            FROM sessions
            WHERE id IN (${placeholders})
        `
        )
        .all(...sessionIds) as Array<
        Pick<DbSessionRow, 'id' | 'latest_activity_at' | 'latest_activity_kind' | 'latest_completed_reply_at'>
    >

    for (const row of rows) {
        result[row.id] = buildSessionMessageActivity(row)
    }

    return result
}

export function mergeSessionMessageActivity(db: Database, id: string, content: unknown, createdAt: number): boolean {
    const current = getSessionRow(db, id)
    if (!current) {
        return false
    }

    const next = mergeProtocolSessionMessageActivity(buildSessionMessageActivity(current), {
        content,
        createdAt,
    })
    if (
        next.latestActivityAt === current.latest_activity_at &&
        next.latestActivityKind === current.latest_activity_kind &&
        next.latestCompletedReplyAt === current.latest_completed_reply_at
    ) {
        return false
    }

    const result = db
        .query(`
        UPDATE sessions
        SET latest_activity_at = @latest_activity_at,
            latest_activity_kind = @latest_activity_kind,
            latest_completed_reply_at = @latest_completed_reply_at
        WHERE id = @id
    `)
        .run({
            id,
            latest_activity_at: next.latestActivityAt,
            latest_activity_kind: next.latestActivityKind,
            latest_completed_reply_at: next.latestCompletedReplyAt,
        })

    return result.changes === 1
}

export function allocateNextSessionMessageSeq(db: Database, id: string): number {
    const row = db
        .query(`
        UPDATE sessions
        SET next_message_seq = next_message_seq + 1
        WHERE id = ?
        RETURNING next_message_seq - 1 AS allocated_seq
    `)
        .get(id) as { allocated_seq: number } | undefined

    if (!row) {
        throw new Error(`Session not found: ${id}`)
    }

    return row.allocated_seq
}
