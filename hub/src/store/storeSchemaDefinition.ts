import type { Database } from 'bun:sqlite'

export const IN_MEMORY_DATABASE_PREFIX = 'file::memory:'
export const SCHEMA_VERSION = 15
export const AUTO_MIGRATABLE_SCHEMA_VERSIONS = [14] as const
export type AutoMigratableSchemaVersion = (typeof AUTO_MIGRATABLE_SCHEMA_VERSIONS)[number]
export const LEGACY_REQUIRED_TABLES = ['sessions', 'machines', 'messages', 'push_subscriptions'] as const
export const REQUIRED_TABLES = [...LEGACY_REQUIRED_TABLES] as const
export const REQUIRED_SESSION_COLUMNS = [
    'permission_mode',
    'collaboration_mode',
    'next_message_seq',
    'latest_activity_at',
    'latest_activity_kind',
    'latest_completed_reply_at',
] as const
export const SCHEMA_REBUILD_GUIDANCE =
    'Back up and rebuild the database, or run an offline migration to the expected schema version.'
export const AUTO_MIGRATABLE_SCHEMA_VERSION_LABEL = AUTO_MIGRATABLE_SCHEMA_VERSIONS.map(
    (version) => `${version} -> ${SCHEMA_VERSION}`
).join(', ')

export function isInMemoryDatabasePath(dbPath: string): boolean {
    return dbPath === ':memory:' || dbPath.startsWith(IN_MEMORY_DATABASE_PREFIX)
}

export function isAutoMigratableSchemaVersion(version: number): version is AutoMigratableSchemaVersion {
    return AUTO_MIGRATABLE_SCHEMA_VERSIONS.includes(version as AutoMigratableSchemaVersion)
}

export function buildSchemaMismatchError(dbPath: string, currentVersion: number): Error {
    const location = isInMemoryDatabasePath(dbPath) ? 'in-memory database' : dbPath
    return new Error(
        `SQLite schema version mismatch for ${location}. ` +
            `Expected ${SCHEMA_VERSION}, found ${currentVersion}. ` +
            `This build only runs the ${AUTO_MIGRATABLE_SCHEMA_VERSION_LABEL} migrations automatically. ` +
            SCHEMA_REBUILD_GUIDANCE
    )
}

export function createStoreSchema(db: Database): void {
    db.exec(`
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
            latest_activity_at INTEGER,
            latest_activity_kind TEXT,
            latest_completed_reply_at INTEGER,
            active INTEGER DEFAULT 0,
            active_at INTEGER,
            seq INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag);
        CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);

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
