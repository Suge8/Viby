import type { Database, SQLQueryBindings } from 'bun:sqlite'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { logger } from '@/ui/logger'
import { getNumber, getString, normalizePath } from './opencodeStorageScannerSupport'

const requireModule = createRequire(import.meta.url)

export type OpencodeStorageDatabase = Database
export type OpencodeStorageSource = 'database' | 'files'

export type OpencodeDbSessionInfo = {
    id: string
    directory: string
    timeCreated: number | null
    timeUpdated: number | null
}

export type OpencodeDbMessage = {
    id: string
    sessionId: string
    timeCreated: number
    timeUpdated: number
    info: Record<string, unknown>
}

export type OpencodeDbPart = {
    id: string
    messageId: string
    sessionId: string
    timeCreated: number
    timeUpdated: number
    part: Record<string, unknown>
}

export function openOpencodeStorageDatabase(storageDir: string): Database | null {
    try {
        const sqlite = requireModule('bun:sqlite') as typeof import('bun:sqlite')
        return new sqlite.Database(join(storageDir, '..', 'opencode.db'), { readonly: true, strict: true })
    } catch (error) {
        logger.debug(`[opencode-storage] SQLite database unavailable: ${error}`)
        return null
    }
}

export function closeOpencodeStorageDatabase(db: Database | null): void {
    if (!db) return
    try {
        db.close()
    } catch (error) {
        logger.debug(`[opencode-storage] Failed to close SQLite database: ${error}`)
    }
}

export function getOpencodeDatabaseSession(db: Database, sessionId: string): OpencodeDbSessionInfo | null {
    const row = readOne(
        db,
        'SELECT id, directory, time_created, time_updated FROM session WHERE id = ? LIMIT 1',
        sessionId
    )
    return row ? parseSessionRow(row) : null
}

export function findOpencodeDatabaseSession(
    db: Database,
    workingDirectory: string,
    referenceTimestampMs: number,
    sessionStartWindowMs: number
): OpencodeDbSessionInfo | null {
    const rows = readAll(
        db,
        `
            SELECT id, directory, time_created, time_updated
            FROM session
            WHERE time_created >= ? AND time_created <= ?
            ORDER BY time_created ASC
        `,
        referenceTimestampMs,
        referenceTimestampMs + sessionStartWindowMs
    )
    const targetCwd = normalizePath(workingDirectory)
    let best: { session: OpencodeDbSessionInfo; score: number } | null = null
    for (const row of rows) {
        const session = parseSessionRow(row)
        if (!session || normalizePath(session.directory) !== targetCwd || session.timeCreated === null) continue
        const score = session.timeCreated - referenceTimestampMs
        if (!best || score < best.score) {
            best = { session, score }
        }
    }
    return best?.session ?? null
}

export function listOpencodeDatabaseSessions(db: Database, workingDirectory: string): OpencodeDbSessionInfo[] {
    const targetCwd = normalizePath(workingDirectory)
    return readAll(db, 'SELECT id, directory, time_created, time_updated FROM session')
        .map(parseSessionRow)
        .filter((session): session is OpencodeDbSessionInfo => Boolean(session))
        .filter((session) => normalizePath(session.directory) === targetCwd)
}

export function readOpencodeDatabaseMessages(db: Database, sessionId: string): OpencodeDbMessage[] {
    return readAll(
        db,
        `
            SELECT id, session_id, time_created, time_updated, data
            FROM message
            WHERE session_id = ?
            ORDER BY time_created ASC
        `,
        sessionId
    )
        .map(parseMessageRow)
        .filter((message): message is OpencodeDbMessage => Boolean(message))
}

export function readOpencodeDatabaseMessagesUpdatedSince(
    db: Database,
    sessionId: string,
    minTimeUpdated: number
): OpencodeDbMessage[] {
    return readAll(
        db,
        `
            SELECT id, session_id, time_created, time_updated, data
            FROM message
            WHERE session_id = ? AND time_updated >= ?
            ORDER BY time_updated ASC, time_created ASC
        `,
        sessionId,
        minTimeUpdated
    )
        .map(parseMessageRow)
        .filter((message): message is OpencodeDbMessage => Boolean(message))
}

export function readOpencodeDatabasePartsByMessage(db: Database, messageId: string): OpencodeDbPart[] {
    return readAll(
        db,
        `
            SELECT id, message_id, session_id, time_created, time_updated, data
            FROM part
            WHERE message_id = ?
            ORDER BY time_created ASC
        `,
        messageId
    )
        .map(parsePartRow)
        .filter((part): part is OpencodeDbPart => Boolean(part))
}

export function readOpencodeDatabasePartsBySession(db: Database, sessionId: string): OpencodeDbPart[] {
    return readAll(
        db,
        `
            SELECT id, message_id, session_id, time_created, time_updated, data
            FROM part
            WHERE session_id = ?
            ORDER BY time_created ASC
        `,
        sessionId
    )
        .map(parsePartRow)
        .filter((part): part is OpencodeDbPart => Boolean(part))
}

export function readOpencodeDatabasePartsUpdatedSince(
    db: Database,
    sessionId: string,
    minTimeUpdated: number
): OpencodeDbPart[] {
    return readAll(
        db,
        `
            SELECT id, message_id, session_id, time_created, time_updated, data
            FROM part
            WHERE session_id = ? AND time_updated >= ?
            ORDER BY time_updated ASC, time_created ASC
        `,
        sessionId,
        minTimeUpdated
    )
        .map(parsePartRow)
        .filter((part): part is OpencodeDbPart => Boolean(part))
}

function readOne(db: Database, query: string, ...params: SQLQueryBindings[]): Record<string, unknown> | null {
    try {
        return parseRow(db.prepare(query).get(...params))
    } catch (error) {
        logger.debug(`[opencode-storage] SQLite read failed: ${error}`)
        return null
    }
}

function readAll(db: Database, query: string, ...params: SQLQueryBindings[]): Record<string, unknown>[] {
    try {
        return db
            .prepare(query)
            .all(...params)
            .map(parseRow)
            .filter((row): row is Record<string, unknown> => Boolean(row))
    } catch (error) {
        logger.debug(`[opencode-storage] SQLite read failed: ${error}`)
        return []
    }
}

function parseRow(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function parseSessionRow(row: Record<string, unknown>): OpencodeDbSessionInfo | null {
    const id = getString(row.id)
    const directory = getString(row.directory)
    if (!id || !directory) return null
    return {
        id,
        directory,
        timeCreated: getNumber(row.time_created),
        timeUpdated: getNumber(row.time_updated),
    }
}

function parseMessageRow(row: Record<string, unknown>): OpencodeDbMessage | null {
    const id = getString(row.id)
    const sessionId = getString(row.session_id)
    const info = parseData(row.data)
    const timeCreated = getNumber(row.time_created)
    const timeUpdated = getNumber(row.time_updated)
    if (!id || !sessionId || !info || timeCreated === null || timeUpdated === null) return null
    return { id, sessionId, timeCreated, timeUpdated, info: { ...info, id, sessionID: sessionId } }
}

function parsePartRow(row: Record<string, unknown>): OpencodeDbPart | null {
    const id = getString(row.id)
    const messageId = getString(row.message_id)
    const sessionId = getString(row.session_id)
    const part = parseData(row.data)
    const timeCreated = getNumber(row.time_created)
    const timeUpdated = getNumber(row.time_updated)
    if (!id || !messageId || !sessionId || !part || timeCreated === null || timeUpdated === null) return null
    return {
        id,
        messageId,
        sessionId,
        timeCreated,
        timeUpdated,
        part: { ...part, id, messageID: messageId, sessionID: sessionId },
    }
}

function parseData(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object') return value as Record<string, unknown>
    if (typeof value !== 'string') return null
    try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
        return null
    }
}
