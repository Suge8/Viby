import { Database } from 'bun:sqlite'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'

import { MachineStore } from './machineStore'
import { MessageStore } from './messageStore'
import { PushStore } from './pushStore'
import { SessionStore } from './sessionStore'

export type {
    StoredMachine,
    StoredMessage,
    StoredPushSubscription,
    StoredSession,
    VersionedUpdateResult
} from './types'
export { MachineStore } from './machineStore'
export { MessageStore } from './messageStore'
export { PushStore } from './pushStore'
export { SessionStore } from './sessionStore'

const IN_MEMORY_DATABASE_PREFIX = 'file::memory:'
const SCHEMA_VERSION = 9
const AUTO_MIGRATABLE_SCHEMA_VERSIONS = [7, 8] as const
const REQUIRED_TABLES = [
    'sessions',
    'machines',
    'messages',
    'push_subscriptions'
] as const
const REQUIRED_SESSION_COLUMNS = [
    'permission_mode',
    'collaboration_mode',
    'next_message_seq'
] as const
const SESSION_COLUMN_DEFINITIONS: Record<(typeof REQUIRED_SESSION_COLUMNS)[number], string> = {
    permission_mode: 'TEXT',
    collaboration_mode: 'TEXT',
    next_message_seq: 'INTEGER NOT NULL DEFAULT 1'
}
const SCHEMA_REBUILD_GUIDANCE =
    'Back up and rebuild the database, or run an offline migration to the expected schema version.'

function isInMemoryDatabasePath(dbPath: string): boolean {
    return dbPath === ':memory:' || dbPath.startsWith(IN_MEMORY_DATABASE_PREFIX)
}

export class Store {
    private db: Database
    private readonly dbPath: string

    readonly sessions: SessionStore
    readonly machines: MachineStore
    readonly messages: MessageStore
    readonly push: PushStore

    constructor(dbPath: string) {
        this.dbPath = dbPath
        const isInMemoryDatabase = isInMemoryDatabasePath(dbPath)

        if (!isInMemoryDatabase) {
            const dir = dirname(dbPath)
            mkdirSync(dir, { recursive: true, mode: 0o700 })
            try {
                chmodSync(dir, 0o700)
            } catch {
            }

            if (!existsSync(dbPath)) {
                try {
                    const fd = openSync(dbPath, 'a', 0o600)
                    closeSync(fd)
                } catch {
                }
            }
        }

        this.db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        this.db.exec('PRAGMA journal_mode = WAL')
        this.db.exec('PRAGMA synchronous = NORMAL')
        this.db.exec('PRAGMA foreign_keys = ON')
        this.db.exec('PRAGMA busy_timeout = 5000')
        this.initSchema()

        if (!isInMemoryDatabase) {
            for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
                try {
                    chmodSync(path, 0o600)
                } catch {
                }
            }
        }

        this.sessions = new SessionStore(this.db)
        this.machines = new MachineStore(this.db)
        this.messages = new MessageStore(this.db)
        this.push = new PushStore(this.db)
    }

    private initSchema(): void {
        const currentVersion = this.getUserVersion()
        if (currentVersion === 0) {
            if (this.hasAnyUserTables()) {
                throw this.buildSchemaMismatchError(currentVersion)
            }

            this.createSchema()
            this.setUserVersion(SCHEMA_VERSION)
            return
        }

        if (currentVersion !== SCHEMA_VERSION) {
            this.migrateSchema(currentVersion)
        }

        this.assertRequiredTablesPresent()
        this.assertRequiredSessionColumnsPresent()
    }

    private createSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                tag TEXT,
                machine_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                agent_state TEXT,
                agent_state_version INTEGER DEFAULT 1,
                model TEXT,
                model_reasoning_effort TEXT,
                permission_mode TEXT,
                collaboration_mode TEXT,
                next_message_seq INTEGER NOT NULL DEFAULT 1,
                todos TEXT,
                todos_updated_at INTEGER,
                team_state TEXT,
                team_state_updated_at INTEGER,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag);

            CREATE TABLE IF NOT EXISTS machines (
                id TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                runner_state TEXT,
                runner_state_version INTEGER DEFAULT 1,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                local_id TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_local_id ON messages(session_id, local_id) WHERE local_id IS NOT NULL;

            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(endpoint)
            );
        `)
    }

    private getUserVersion(): number {
        const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
        return row?.user_version ?? 0
    }

    private migrateSchema(currentVersion: number): void {
        if (!AUTO_MIGRATABLE_SCHEMA_VERSIONS.includes(currentVersion as 7 | 8)) {
            throw this.buildSchemaMismatchError(currentVersion)
        }

        this.assertRequiredTablesPresent()
        this.db.exec('BEGIN IMMEDIATE')

        try {
            const missingColumns = this.addMissingSessionColumns()
            if (missingColumns.includes('next_message_seq') || currentVersion < SCHEMA_VERSION) {
                this.backfillSessionMessageSeqCounters()
            }
            this.setUserVersion(SCHEMA_VERSION)
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            throw error
        }
    }

    private setUserVersion(version: number): void {
        this.db.exec(`PRAGMA user_version = ${version}`)
    }

    private hasAnyUserTables(): boolean {
        const row = this.db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1"
        ).get() as { name?: string } | undefined
        return Boolean(row?.name)
    }

    private assertRequiredTablesPresent(): void {
        const placeholders = REQUIRED_TABLES.map(() => '?').join(', ')
        const rows = this.db.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
        ).all(...REQUIRED_TABLES) as Array<{ name: string }>
        const existing = new Set(rows.map((row) => row.name))
        const missing = REQUIRED_TABLES.filter((table) => !existing.has(table))

        if (missing.length > 0) {
            throw new Error(
                `SQLite schema is missing required tables (${missing.join(', ')}). ` +
                SCHEMA_REBUILD_GUIDANCE
            )
        }
    }

    private addMissingSessionColumns(): Array<(typeof REQUIRED_SESSION_COLUMNS)[number]> {
        const missingColumns = this.getMissingTableColumns('sessions', REQUIRED_SESSION_COLUMNS)
        for (const columnName of missingColumns) {
            this.db.exec(
                `ALTER TABLE sessions ADD COLUMN ${columnName} ${SESSION_COLUMN_DEFINITIONS[columnName]}`
            )
        }
        return missingColumns
    }

    private backfillSessionMessageSeqCounters(): void {
        this.db.exec(`
            UPDATE sessions
            SET next_message_seq = COALESCE(
                (
                    SELECT MAX(messages.seq) + 1
                    FROM messages
                    WHERE messages.session_id = sessions.id
                ),
                1
            )
        `)
    }

    private assertRequiredSessionColumnsPresent(): void {
        const missingColumns = this.getMissingTableColumns('sessions', REQUIRED_SESSION_COLUMNS)
        if (missingColumns.length > 0) {
            throw new Error(
                `SQLite schema is missing required session columns (${missingColumns.join(', ')}). ` +
                SCHEMA_REBUILD_GUIDANCE
            )
        }
    }

    private getMissingTableColumns<TColumnName extends string>(
        tableName: string,
        requiredColumns: readonly TColumnName[]
    ): TColumnName[] {
        const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
        const existingColumns = new Set(rows.map((row) => row.name))
        return requiredColumns.filter((columnName) => !existingColumns.has(columnName))
    }

    private buildSchemaMismatchError(currentVersion: number): Error {
        const location = isInMemoryDatabasePath(this.dbPath)
            ? 'in-memory database'
            : this.dbPath
        return new Error(
            `SQLite schema version mismatch for ${location}. ` +
            `Expected ${SCHEMA_VERSION}, found ${currentVersion}. ` +
            `This build only runs the 7 -> ${SCHEMA_VERSION} and 8 -> ${SCHEMA_VERSION} migrations automatically. ` +
            SCHEMA_REBUILD_GUIDANCE
        )
    }
}
