import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import {
    getSessionActivityKind,
    SESSION_MAX_MESSAGE_PAGE_SIZE,
    shouldMessageAdvanceSessionUpdatedAt,
} from '@viby/protocol'
import { safeJsonParse } from './json'
import { allocateNextSessionMessageSeq, mergeSessionMessageActivity, touchSessionUpdatedAt } from './sessions'
import type { StoredMessage } from './types'

type CreateStoredMessageInput = {
    content: unknown
    createdAt?: number
    invokedAt?: number | null
    localId?: string
}

type DbMessageRow = {
    id: string
    session_id: string
    content: string
    created_at: number
    seq: number
    local_id: string | null
    invoked_at: number | null
}

const INTERNAL_MESSAGE_FETCH_MAX = SESSION_MAX_MESSAGE_PAGE_SIZE + 1

function recordSessionMessageSideEffects(db: Database, sessionId: string, content: unknown, createdAt: number): void {
    mergeSessionMessageActivity(db, sessionId, content, createdAt)
    if (shouldMessageAdvanceSessionUpdatedAt(getSessionActivityKind(content))) {
        touchSessionUpdatedAt(db, sessionId, createdAt)
    }
}

function toStoredMessage(row: DbMessageRow): StoredMessage {
    return {
        id: row.id,
        sessionId: row.session_id,
        content: safeJsonParse(row.content),
        createdAt: row.created_at,
        seq: row.seq,
        localId: row.local_id,
        invokedAt: row.invoked_at ?? null,
    }
}

function getFiniteTimestamp(value: number | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function resolveInvokedAt(input: CreateStoredMessageInput, createdAt: number): number | null {
    if (input.invokedAt === null) {
        return null
    }

    return getFiniteTimestamp(input.invokedAt) ?? createdAt
}

function insertMessage(db: Database, sessionId: string, input: CreateStoredMessageInput): StoredMessage {
    const createdAt = getFiniteTimestamp(input.createdAt) ?? Date.now()
    const invokedAt = resolveInvokedAt(input, createdAt)
    const json = JSON.stringify(input.content)

    if (input.localId) {
        const existing = db
            .query('SELECT * FROM messages WHERE session_id = ? AND local_id = ? LIMIT 1')
            .get(sessionId, input.localId) as DbMessageRow | undefined
        if (existing) {
            return toStoredMessage(existing)
        }
    }

    const msgSeq = allocateNextSessionMessageSeq(db, sessionId)
    const id = randomUUID()

    db.query(`
        INSERT INTO messages (
            id, session_id, content, created_at, seq, local_id, invoked_at
        ) VALUES (
            @id, @session_id, @content, @created_at, @seq, @local_id, @invoked_at
        )
    `).run({
        id,
        session_id: sessionId,
        content: json,
        created_at: createdAt,
        seq: msgSeq,
        local_id: input.localId ?? null,
        invoked_at: invokedAt,
    })

    recordSessionMessageSideEffects(db, sessionId, input.content, createdAt)

    const row = db.query('SELECT * FROM messages WHERE id = ?').get(id) as DbMessageRow | undefined
    if (!row) {
        throw new Error('Failed to create message')
    }

    return toStoredMessage(row)
}

export function addMessage(
    db: Database,
    sessionId: string,
    content: unknown,
    localId?: string,
    createdAt?: number,
    invokedAt?: number | null
): StoredMessage {
    return addMessages(db, sessionId, [{ content, localId, createdAt, invokedAt }])[0]
}

export function addMessages(db: Database, sessionId: string, inputs: CreateStoredMessageInput[]): StoredMessage[] {
    if (inputs.length === 0) {
        return []
    }

    db.exec('BEGIN IMMEDIATE')
    try {
        const storedMessages = inputs.map((input) => insertMessage(db, sessionId, input))
        db.exec('COMMIT')
        return storedMessages
    } catch (error) {
        db.exec('ROLLBACK')
        throw error
    }
}

export function getMessages(
    db: Database,
    sessionId: string,
    limit: number = SESSION_MAX_MESSAGE_PAGE_SIZE,
    beforeSeq?: number
): StoredMessage[] {
    const safeLimit = Number.isFinite(limit)
        ? Math.max(1, Math.min(INTERNAL_MESSAGE_FETCH_MAX, limit))
        : SESSION_MAX_MESSAGE_PAGE_SIZE

    const rows =
        beforeSeq !== undefined && beforeSeq !== null && Number.isFinite(beforeSeq)
            ? (db
                  .query('SELECT * FROM messages WHERE session_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?')
                  .all(sessionId, beforeSeq, safeLimit) as DbMessageRow[])
            : (db
                  .query('SELECT * FROM messages WHERE session_id = ? ORDER BY seq DESC LIMIT ?')
                  .all(sessionId, safeLimit) as DbMessageRow[])

    return rows.reverse().map(toStoredMessage)
}

export function getMessagesAfter(
    db: Database,
    sessionId: string,
    afterSeq: number,
    limit: number = SESSION_MAX_MESSAGE_PAGE_SIZE
): StoredMessage[] {
    const safeLimit = Number.isFinite(limit)
        ? Math.max(1, Math.min(INTERNAL_MESSAGE_FETCH_MAX, limit))
        : SESSION_MAX_MESSAGE_PAGE_SIZE
    const safeAfterSeq = Number.isFinite(afterSeq) ? afterSeq : 0

    const rows = db
        .query('SELECT * FROM messages WHERE session_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?')
        .all(sessionId, safeAfterSeq, safeLimit) as DbMessageRow[]

    return rows.map(toStoredMessage)
}

export function getMaxSeq(db: Database, sessionId: string): number {
    const row = db.query('SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM messages WHERE session_id = ?').get(sessionId) as
        | { maxSeq: number }
        | undefined
    return row?.maxSeq ?? 0
}

export function getUninvokedLocalMessages(db: Database, sessionId: string): StoredMessage[] {
    const rows = db
        .query(
            'SELECT * FROM messages WHERE session_id = ? AND local_id IS NOT NULL AND invoked_at IS NULL ORDER BY seq ASC'
        )
        .all(sessionId) as DbMessageRow[]
    return rows.map(toStoredMessage)
}

export function markMessagesInvoked(db: Database, sessionId: string, localIds: string[], invokedAt: number): number {
    if (localIds.length === 0) {
        return 0
    }

    const placeholders = localIds.map(() => '?').join(', ')
    const result = db
        .query(
            `UPDATE messages
             SET invoked_at = ?
             WHERE session_id = ?
               AND local_id IN (${placeholders})
               AND invoked_at IS NULL`
        )
        .run(invokedAt, sessionId, ...localIds)
    return result.changes
}

export function cancelQueuedMessages(db: Database, sessionId: string, localIds: string[]): string[] {
    if (localIds.length === 0) {
        return []
    }

    const placeholders = localIds.map(() => '?').join(', ')
    const rows = db
        .query(
            `SELECT local_id
             FROM messages
             WHERE session_id = ?
               AND local_id IN (${placeholders})
               AND invoked_at IS NULL`
        )
        .all(sessionId, ...localIds) as Array<{ local_id: string | null }>
    const canceledLocalIds = rows
        .map((row) => row.local_id)
        .filter((localId): localId is string => typeof localId === 'string')
    if (canceledLocalIds.length === 0) {
        return []
    }

    const deletePlaceholders = canceledLocalIds.map(() => '?').join(', ')
    db.query(
        `DELETE FROM messages
         WHERE session_id = ?
           AND local_id IN (${deletePlaceholders})
           AND invoked_at IS NULL`
    ).run(sessionId, ...canceledLocalIds)
    return canceledLocalIds
}

export function mergeSessionMessages(
    db: Database,
    fromSessionId: string,
    toSessionId: string
): { moved: number; oldMaxSeq: number; newMaxSeq: number } {
    if (fromSessionId === toSessionId) {
        return { moved: 0, oldMaxSeq: 0, newMaxSeq: 0 }
    }

    const oldMaxSeq = getMaxSeq(db, fromSessionId)
    const newMaxSeq = getMaxSeq(db, toSessionId)

    try {
        db.exec('BEGIN')

        if (newMaxSeq > 0 && oldMaxSeq > 0) {
            db.query('UPDATE messages SET seq = seq + ? WHERE session_id = ?').run(oldMaxSeq, toSessionId)
        }

        const collisions = db
            .query(`
            SELECT local_id FROM messages
            WHERE session_id = ? AND local_id IS NOT NULL
            INTERSECT
            SELECT local_id FROM messages
            WHERE session_id = ? AND local_id IS NOT NULL
        `)
            .all(toSessionId, fromSessionId) as Array<{ local_id: string }>

        if (collisions.length > 0) {
            const localIds = collisions.map((row) => row.local_id)
            const placeholders = localIds.map(() => '?').join(', ')
            db.query(
                `UPDATE messages
                 SET local_id = NULL,
                     invoked_at = COALESCE(invoked_at, created_at)
                 WHERE session_id = ? AND local_id IN (${placeholders})`
            ).run(fromSessionId, ...localIds)
        }

        const result = db
            .query('UPDATE messages SET session_id = ? WHERE session_id = ?')
            .run(toSessionId, fromSessionId)

        db.exec('COMMIT')
        return { moved: result.changes, oldMaxSeq, newMaxSeq }
    } catch (error) {
        db.exec('ROLLBACK')
        throw error
    }
}
