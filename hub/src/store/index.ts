import { Database } from 'bun:sqlite'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'
import {
    createBuiltInTeamRoleDefinition,
    TEAM_MEMBER_ROLE_PROTOTYPES
} from '@viby/protocol'

import { MachineStore } from './machineStore'
import { MessageStore } from './messageStore'
import { PushStore } from './pushStore'
import { SessionStore } from './sessionStore'
import { TeamStore } from './teamStore'

export type {
    StoredMachine,
    StoredMessage,
    StoredPushSubscription,
    StoredSessionTeamContext,
    StoredSession,
    StoredTeamEvent,
    StoredTeamMember,
    StoredTeamProject,
    StoredTeamRole,
    StoredTeamTask,
    VersionedUpdateResult
} from './types'
export { MachineStore } from './machineStore'
export { MessageStore } from './messageStore'
export { PushStore } from './pushStore'
export { SessionStore } from './sessionStore'
export { TeamStore } from './teamStore'

const IN_MEMORY_DATABASE_PREFIX = 'file::memory:'
const SCHEMA_VERSION = 12
const AUTO_MIGRATABLE_SCHEMA_VERSIONS = [7, 8, 9, 10, 11] as const
const LEGACY_REQUIRED_TABLES = [
    'sessions',
    'machines',
    'messages',
    'push_subscriptions'
] as const
const REQUIRED_TABLES = [
    ...LEGACY_REQUIRED_TABLES,
    'team_projects',
    'team_roles',
    'team_members',
    'team_tasks',
    'team_events'
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
const REQUIRED_TEAM_MEMBER_COLUMNS = ['role_id'] as const
const TEAM_MEMBER_COLUMN_DEFINITIONS: Record<(typeof REQUIRED_TEAM_MEMBER_COLUMNS)[number], string> = {
    role_id: 'TEXT'
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
    readonly teams: TeamStore

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
        this.teams = new TeamStore(this.db)
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
        this.assertRequiredTeamMemberColumnsPresent()
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

            CREATE TABLE IF NOT EXISTS team_projects (
                id TEXT PRIMARY KEY,
                manager_session_id TEXT NOT NULL,
                machine_id TEXT,
                root_directory TEXT,
                title TEXT NOT NULL,
                goal TEXT,
                status TEXT NOT NULL,
                max_active_members INTEGER NOT NULL DEFAULT 6,
                default_isolation_mode TEXT NOT NULL DEFAULT 'hybrid',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                delivered_at INTEGER,
                archived_at INTEGER,
                FOREIGN KEY (manager_session_id) REFERENCES sessions(id)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_team_projects_manager_session ON team_projects(manager_session_id);

            CREATE TABLE IF NOT EXISTS team_roles (
                project_id TEXT NOT NULL,
                id TEXT NOT NULL,
                source TEXT NOT NULL,
                prototype TEXT NOT NULL,
                name TEXT NOT NULL,
                prompt_extension TEXT,
                provider_flavor TEXT NOT NULL,
                model TEXT,
                reasoning_effort TEXT,
                isolation_mode TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (project_id, id),
                FOREIGN KEY (project_id) REFERENCES team_projects(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_team_roles_project ON team_roles(project_id, source, prototype);

            CREATE TABLE IF NOT EXISTS team_members (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                manager_session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                role_id TEXT NOT NULL,
                provider_flavor TEXT,
                model TEXT,
                reasoning_effort TEXT,
                isolation_mode TEXT NOT NULL,
                workspace_root TEXT,
                control_owner TEXT NOT NULL DEFAULT 'manager',
                membership_state TEXT NOT NULL DEFAULT 'active',
                revision INTEGER NOT NULL DEFAULT 1,
                supersedes_member_id TEXT,
                superseded_by_member_id TEXT,
                spawned_for_task_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                archived_at INTEGER,
                removed_at INTEGER,
                FOREIGN KEY (project_id) REFERENCES team_projects(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id, role_id) REFERENCES team_roles(project_id, id),
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_session ON team_members(session_id);
            CREATE INDEX IF NOT EXISTS idx_team_members_project ON team_members(project_id);
            CREATE INDEX IF NOT EXISTS idx_team_members_manager ON team_members(manager_session_id);

            CREATE TABLE IF NOT EXISTS team_tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                parent_task_id TEXT,
                title TEXT NOT NULL,
                description TEXT,
                acceptance_criteria TEXT,
                status TEXT NOT NULL,
                assignee_member_id TEXT,
                reviewer_member_id TEXT,
                verifier_member_id TEXT,
                priority TEXT,
                depends_on TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                completed_at INTEGER,
                FOREIGN KEY (project_id) REFERENCES team_projects(id) ON DELETE CASCADE,
                FOREIGN KEY (parent_task_id) REFERENCES team_tasks(id),
                FOREIGN KEY (assignee_member_id) REFERENCES team_members(id),
                FOREIGN KEY (reviewer_member_id) REFERENCES team_members(id),
                FOREIGN KEY (verifier_member_id) REFERENCES team_members(id)
            );
            CREATE INDEX IF NOT EXISTS idx_team_tasks_project ON team_tasks(project_id);
            CREATE INDEX IF NOT EXISTS idx_team_tasks_status ON team_tasks(project_id, status);

            CREATE TABLE IF NOT EXISTS team_events (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                actor_type TEXT NOT NULL,
                actor_id TEXT,
                target_type TEXT NOT NULL,
                target_id TEXT,
                payload TEXT,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (project_id) REFERENCES team_projects(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_team_events_project_created ON team_events(project_id, created_at);
        `)
    }

    private getUserVersion(): number {
        const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
        return row?.user_version ?? 0
    }

    private migrateSchema(currentVersion: number): void {
        if (!AUTO_MIGRATABLE_SCHEMA_VERSIONS.includes(currentVersion as 7 | 8 | 9 | 10 | 11)) {
            throw this.buildSchemaMismatchError(currentVersion)
        }

        this.assertRequiredTablesPresent(LEGACY_REQUIRED_TABLES)
        this.db.exec('BEGIN IMMEDIATE')

        try {
            const missingColumns = this.addMissingSessionColumns()
            if (missingColumns.includes('next_message_seq') || currentVersion < 10) {
                this.backfillSessionMessageSeqCounters()
            }
            this.createSchema()
            if (currentVersion < 12) {
                this.backfillSessionMetadataDrivers()
            }
            const missingTeamMemberColumns = this.addMissingTeamMemberColumns()
            if (missingTeamMemberColumns.includes('role_id')) {
                this.backfillTeamMemberRoleIds()
            }
            if (currentVersion < SCHEMA_VERSION) {
                this.seedMissingBuiltInTeamRoles()
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

    private assertRequiredTablesPresent(requiredTables: readonly string[] = REQUIRED_TABLES): void {
        const placeholders = requiredTables.map(() => '?').join(', ')
        const rows = this.db.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
        ).all(...requiredTables) as Array<{ name: string }>
        const existing = new Set(rows.map((row) => row.name))
        const missing = requiredTables.filter((table) => !existing.has(table))

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

    private backfillSessionMetadataDrivers(): void {
        this.db.exec(`
            UPDATE sessions
            SET metadata = json_remove(
                    CASE
                        WHEN json_type(metadata, '$.driver') IS NULL
                            THEN json_set(metadata, '$.driver', json_extract(metadata, '$.flavor'))
                        ELSE metadata
                    END,
                    '$.flavor'
                ),
                metadata_version = metadata_version + 1
            WHERE metadata IS NOT NULL
              AND json_valid(metadata)
              AND json_type(metadata, '$.flavor') = 'text'
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

    private addMissingTeamMemberColumns(): Array<(typeof REQUIRED_TEAM_MEMBER_COLUMNS)[number]> {
        const missingColumns = this.getMissingTableColumns('team_members', REQUIRED_TEAM_MEMBER_COLUMNS)
        for (const columnName of missingColumns) {
            this.db.exec(
                `ALTER TABLE team_members ADD COLUMN ${columnName} ${TEAM_MEMBER_COLUMN_DEFINITIONS[columnName]}`
            )
        }
        return missingColumns
    }

    private backfillTeamMemberRoleIds(): void {
        this.db.exec(`
            UPDATE team_members
            SET role_id = role
            WHERE role_id IS NULL OR role_id = ''
        `)
    }

    private seedMissingBuiltInTeamRoles(): void {
        const projectRows = this.db.prepare(`
            SELECT id, created_at
            FROM team_projects
        `).all() as Array<{ id: string; created_at: number }>
        const insertRole = this.db.prepare(`
            INSERT OR IGNORE INTO team_roles (
                project_id, id, source, prototype, name, prompt_extension,
                provider_flavor, model, reasoning_effort, isolation_mode,
                created_at, updated_at
            ) VALUES (
                @project_id, @id, @source, @prototype, @name, @prompt_extension,
                @provider_flavor, @model, @reasoning_effort, @isolation_mode,
                @created_at, @updated_at
            )
        `)

        for (const project of projectRows) {
            for (const prototype of TEAM_MEMBER_ROLE_PROTOTYPES) {
                const definition = createBuiltInTeamRoleDefinition(project.id, prototype, project.created_at)
                insertRole.run({
                    project_id: definition.projectId,
                    id: definition.id,
                    source: definition.source,
                    prototype: definition.prototype,
                    name: definition.name,
                    prompt_extension: definition.promptExtension,
                    provider_flavor: definition.providerFlavor,
                    model: definition.model,
                    reasoning_effort: definition.reasoningEffort,
                    isolation_mode: definition.isolationMode,
                    created_at: definition.createdAt,
                    updated_at: definition.updatedAt
                })
            }
        }
    }

    private assertRequiredTeamMemberColumnsPresent(): void {
        const missingColumns = this.getMissingTableColumns('team_members', REQUIRED_TEAM_MEMBER_COLUMNS)
        if (missingColumns.length > 0) {
            throw new Error(
                `SQLite schema is missing required team_members columns (${missingColumns.join(', ')}). ` +
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
            `This build only runs the 7 -> ${SCHEMA_VERSION}, 8 -> ${SCHEMA_VERSION}, 9 -> ${SCHEMA_VERSION}, 10 -> ${SCHEMA_VERSION}, and 11 -> ${SCHEMA_VERSION} migrations automatically. ` +
            SCHEMA_REBUILD_GUIDANCE
        )
    }
}
