import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Store } from './index'

const tempDirs: string[] = []

afterEach(async () => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop()
        if (!dir) {
            continue
        }

        await rm(dir, { recursive: true, force: true })
    }
})

async function createTempDbPath(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'viby-store-migration-'))
    tempDirs.push(dir)
    return join(dir, 'viby.db')
}

function createLegacySchemaV7(dbPath: string): void {
    const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
    db.exec(`
        CREATE TABLE sessions (
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
            todos TEXT,
            todos_updated_at INTEGER,
            team_state TEXT,
            team_state_updated_at INTEGER,
            active INTEGER DEFAULT 0,
            active_at INTEGER,
            seq INTEGER DEFAULT 0
        );
        CREATE TABLE machines (
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
        CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            local_id TEXT
        );
        CREATE TABLE push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(endpoint)
        );
    `)
    db.prepare(`
        INSERT INTO sessions (
            id, tag, machine_id, created_at, updated_at,
            metadata, metadata_version,
            agent_state, agent_state_version,
            model, model_reasoning_effort,
            todos, todos_updated_at,
            team_state, team_state_updated_at,
            active, active_at, seq
        ) VALUES (
            @id, @tag, @machine_id, @created_at, @updated_at,
            @metadata, @metadata_version,
            @agent_state, @agent_state_version,
            @model, @model_reasoning_effort,
            @todos, @todos_updated_at,
            @team_state, @team_state_updated_at,
            @active, @active_at, @seq
        )
    `).run({
        id: 'legacy-session',
        tag: 'resume-me',
        machine_id: 'machine-1',
        created_at: 1_000,
        updated_at: 2_000,
        metadata: JSON.stringify({ path: '/tmp/project', flavor: 'codex' }),
        metadata_version: 1,
        agent_state: null,
        agent_state_version: 1,
        model: 'gpt-5.4',
        model_reasoning_effort: 'high',
        todos: null,
        todos_updated_at: null,
        team_state: null,
        team_state_updated_at: null,
        active: 0,
        active_at: null,
        seq: 3
    })
    db.prepare(`
        INSERT INTO messages (id, session_id, content, created_at, seq, local_id)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run('legacy-message', 'legacy-session', JSON.stringify({ role: 'user', content: [] }), 1_500, 4, null)
    db.exec('PRAGMA user_version = 7')
    db.close()
}

function createLegacySchemaV8(dbPath: string): void {
    const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
    db.exec(`
        CREATE TABLE sessions (
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
            todos TEXT,
            todos_updated_at INTEGER,
            team_state TEXT,
            team_state_updated_at INTEGER,
            active INTEGER DEFAULT 0,
            active_at INTEGER,
            seq INTEGER DEFAULT 0
        );
        CREATE TABLE machines (
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
        CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            local_id TEXT
        );
        CREATE TABLE push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(endpoint)
        );
    `)
    db.prepare(`
        INSERT INTO sessions (
            id, tag, machine_id, created_at, updated_at,
            metadata, metadata_version,
            agent_state, agent_state_version,
            model, model_reasoning_effort,
            permission_mode, collaboration_mode,
            todos, todos_updated_at,
            team_state, team_state_updated_at,
            active, active_at, seq
        ) VALUES (
            @id, @tag, @machine_id, @created_at, @updated_at,
            @metadata, @metadata_version,
            @agent_state, @agent_state_version,
            @model, @model_reasoning_effort,
            @permission_mode, @collaboration_mode,
            @todos, @todos_updated_at,
            @team_state, @team_state_updated_at,
            @active, @active_at, @seq
        )
    `).run({
        id: 'legacy-session-v8',
        tag: 'resume-me-v8',
        machine_id: 'machine-1',
        created_at: 1_000,
        updated_at: 2_000,
        metadata: JSON.stringify({ path: '/tmp/project', flavor: 'claude' }),
        metadata_version: 1,
        agent_state: null,
        agent_state_version: 1,
        model: null,
        model_reasoning_effort: null,
        permission_mode: 'default',
        collaboration_mode: 'chat',
        todos: null,
        todos_updated_at: null,
        team_state: null,
        team_state_updated_at: null,
        active: 0,
        active_at: null,
        seq: 1
    })
    db.prepare(`
        INSERT INTO messages (id, session_id, content, created_at, seq, local_id)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run('legacy-message-v8', 'legacy-session-v8', JSON.stringify({ role: 'assistant', content: [] }), 1_500, 7, null)
    db.exec('PRAGMA user_version = 8')
    db.close()
}

function createLegacySchemaV9(dbPath: string): void {
    const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
    db.exec(`
        CREATE TABLE sessions (
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
        CREATE TABLE machines (
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
        CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            local_id TEXT
        );
        CREATE TABLE push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(endpoint)
        );
    `)
    db.exec('PRAGMA user_version = 9')
    db.close()
}

function createLegacySchemaV10(dbPath: string): void {
    const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
    db.exec(`
        CREATE TABLE sessions (
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
        CREATE TABLE machines (
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
        CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            local_id TEXT
        );
        CREATE TABLE push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(endpoint)
        );
        CREATE TABLE team_projects (
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
            archived_at INTEGER
        );
        CREATE TABLE team_members (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            manager_session_id TEXT NOT NULL,
            role TEXT NOT NULL,
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
            removed_at INTEGER
        );
        CREATE TABLE team_tasks (
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
            completed_at INTEGER
        );
        CREATE TABLE team_events (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            actor_type TEXT NOT NULL,
            actor_id TEXT,
            target_type TEXT NOT NULL,
            target_id TEXT,
            payload TEXT,
            created_at INTEGER NOT NULL
        );
    `)
    db.prepare(`
        INSERT INTO sessions (
            id, tag, machine_id, created_at, updated_at,
            metadata, metadata_version,
            agent_state, agent_state_version,
            model, model_reasoning_effort,
            permission_mode, collaboration_mode, next_message_seq,
            todos, todos_updated_at,
            team_state, team_state_updated_at,
            active, active_at, seq
        ) VALUES (
            @id, @tag, @machine_id, @created_at, @updated_at,
            @metadata, @metadata_version,
            @agent_state, @agent_state_version,
            @model, @model_reasoning_effort,
            @permission_mode, @collaboration_mode, @next_message_seq,
            @todos, @todos_updated_at,
            @team_state, @team_state_updated_at,
            @active, @active_at, @seq
        )
    `).run({
        id: 'manager-session',
        tag: 'manager-session',
        machine_id: 'machine-1',
        created_at: 1_000,
        updated_at: 1_500,
        metadata: JSON.stringify({ path: '/tmp/project', host: 'localhost', flavor: 'codex' }),
        metadata_version: 1,
        agent_state: null,
        agent_state_version: 1,
        model: 'gpt-5.4',
        model_reasoning_effort: 'high',
        permission_mode: 'default',
        collaboration_mode: 'default',
        next_message_seq: 1,
        todos: null,
        todos_updated_at: null,
        team_state: null,
        team_state_updated_at: null,
        active: 0,
        active_at: null,
        seq: 1
    })
    db.prepare(`
        INSERT INTO sessions (
            id, tag, machine_id, created_at, updated_at,
            metadata, metadata_version,
            agent_state, agent_state_version,
            model, model_reasoning_effort,
            permission_mode, collaboration_mode, next_message_seq,
            todos, todos_updated_at,
            team_state, team_state_updated_at,
            active, active_at, seq
        ) VALUES (
            @id, @tag, @machine_id, @created_at, @updated_at,
            @metadata, @metadata_version,
            @agent_state, @agent_state_version,
            @model, @model_reasoning_effort,
            @permission_mode, @collaboration_mode, @next_message_seq,
            @todos, @todos_updated_at,
            @team_state, @team_state_updated_at,
            @active, @active_at, @seq
        )
    `).run({
        id: 'member-session',
        tag: 'member-session',
        machine_id: 'machine-1',
        created_at: 1_100,
        updated_at: 1_600,
        metadata: JSON.stringify({ path: '/tmp/project', host: 'localhost', flavor: 'codex' }),
        metadata_version: 1,
        agent_state: null,
        agent_state_version: 1,
        model: 'gpt-5.4',
        model_reasoning_effort: 'high',
        permission_mode: 'default',
        collaboration_mode: 'default',
        next_message_seq: 1,
        todos: null,
        todos_updated_at: null,
        team_state: null,
        team_state_updated_at: null,
        active: 0,
        active_at: null,
        seq: 1
    })
    db.prepare(`
        INSERT INTO team_projects (
            id, manager_session_id, machine_id, root_directory, title, goal, status,
            max_active_members, default_isolation_mode, created_at, updated_at, delivered_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        'project-1',
        'manager-session',
        'machine-1',
        '/tmp/project',
        'Manager Project',
        'Ship manager teams',
        'active',
        6,
        'hybrid',
        1_000,
        1_500,
        null,
        null
    )
    db.prepare(`
        INSERT INTO team_members (
            id, project_id, session_id, manager_session_id, role, provider_flavor, model, reasoning_effort,
            isolation_mode, workspace_root, control_owner, membership_state, revision,
            supersedes_member_id, superseded_by_member_id, spawned_for_task_id,
            created_at, updated_at, archived_at, removed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        'member-1',
        'project-1',
        'member-session',
        'manager-session',
        'implementer',
        'codex',
        'gpt-5.4',
        'high',
        'worktree',
        '/tmp/project/worktrees/member-1',
        'manager',
        'active',
        1,
        null,
        null,
        null,
        1_100,
        1_600,
        null,
        null
    )
    db.exec('PRAGMA user_version = 10')
    db.close()
}

function getStoreDatabase(store: Store): Database {
    return (store as unknown as { db: Database }).db
}

function getTableNames(db: Database): string[] {
    return (db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).all() as Array<{ name: string }>).map((row) => row.name)
}

function hasFlavorField(value: unknown): boolean {
    return typeof value === 'object' && value !== null && 'flavor' in value
}

describe('store schema migration', () => {
    it('migrates a v7 sessions table to v12 without losing session config state', async () => {
        const dbPath = await createTempDbPath()
        createLegacySchemaV7(dbPath)

        const store = new Store(dbPath)
        const db = getStoreDatabase(store)
        try {
            const userVersion = db.prepare('PRAGMA user_version').get() as { user_version: number }
            const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>

            expect(userVersion.user_version).toBe(12)
            expect(sessionColumns.map((column) => column.name)).toEqual(
                expect.arrayContaining(['permission_mode', 'collaboration_mode', 'next_message_seq'])
            )
            expect(getTableNames(db)).toEqual(expect.arrayContaining([
                'team_projects',
                'team_roles',
                'team_members',
                'team_tasks',
                'team_events'
            ]))

            const legacySession = store.sessions.getSession('legacy-session')
            expect(legacySession).toMatchObject({
                id: 'legacy-session',
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                permissionMode: null,
                collaborationMode: null
            })
            expect(legacySession?.metadata).toMatchObject({
                path: '/tmp/project',
                driver: 'codex'
            })
            expect(hasFlavorField(legacySession?.metadata)).toBe(false)

            expect(store.sessions.setSessionPermissionMode('legacy-session', 'yolo')).toBe(true)
            expect(store.sessions.setSessionCollaborationMode('legacy-session', 'plan')).toBe(true)
            expect(store.sessions.getSession('legacy-session')).toMatchObject({
                permissionMode: 'yolo',
                collaborationMode: 'plan'
            })

            const message = store.messages.addMessage('legacy-session', { role: 'user', content: [] })
            expect(message.seq).toBe(5)
        } finally {
            db.close()
        }
    })

    it('migrates a v8 sessions table to v12, migrates metadata.driver, and backfills next_message_seq', async () => {
        const dbPath = await createTempDbPath()
        createLegacySchemaV8(dbPath)

        const store = new Store(dbPath)
        const db = getStoreDatabase(store)
        try {
            const userVersion = db.prepare('PRAGMA user_version').get() as { user_version: number }
            const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>

            expect(userVersion.user_version).toBe(12)
            expect(sessionColumns.map((column) => column.name)).toContain('next_message_seq')
            expect(getTableNames(db)).toEqual(expect.arrayContaining([
                'team_projects',
                'team_roles',
                'team_members',
                'team_tasks',
                'team_events'
            ]))
            expect(store.sessions.getSession('legacy-session-v8')?.metadata).toMatchObject({
                path: '/tmp/project',
                driver: 'claude'
            })
            expect(hasFlavorField(store.sessions.getSession('legacy-session-v8')?.metadata)).toBe(false)

            const message = store.messages.addMessage('legacy-session-v8', { role: 'user', content: [] })
            expect(message.seq).toBe(8)
        } finally {
            db.close()
        }
    })

    it('migrates a v9 store to v12 by adding manager teams tables without rebuilding session rows', async () => {
        const dbPath = await createTempDbPath()
        createLegacySchemaV9(dbPath)

        const store = new Store(dbPath)
        const db = getStoreDatabase(store)
        try {
            const userVersion = db.prepare('PRAGMA user_version').get() as { user_version: number }

            expect(userVersion.user_version).toBe(12)
            expect(getTableNames(db)).toEqual(expect.arrayContaining([
                'team_projects',
                'team_roles',
                'team_members',
                'team_tasks',
                'team_events'
            ]))
        } finally {
            db.close()
        }
    })

    it('migrates a v10 store to v12 by backfilling role_id, seeding built-in roles, and normalizing metadata.driver', async () => {
        const dbPath = await createTempDbPath()
        createLegacySchemaV10(dbPath)

        const store = new Store(dbPath)
        const db = getStoreDatabase(store)
        try {
            const userVersion = db.prepare('PRAGMA user_version').get() as { user_version: number }
            const memberColumns = db.prepare('PRAGMA table_info(team_members)').all() as Array<{ name: string }>

            expect(userVersion.user_version).toBe(12)
            expect(memberColumns.map((column) => column.name)).toContain('role_id')
            expect(store.teams.getMember('member-1')).toMatchObject({
                role: 'implementer',
                roleId: 'implementer'
            })
            expect(store.sessions.getSession('manager-session')?.metadata).toMatchObject({
                path: '/tmp/project',
                driver: 'codex'
            })
            expect(store.sessions.getSession('member-session')?.metadata).toMatchObject({
                path: '/tmp/project',
                driver: 'codex'
            })
            expect(hasFlavorField(store.sessions.getSession('manager-session')?.metadata)).toBe(false)
            expect(hasFlavorField(store.sessions.getSession('member-session')?.metadata)).toBe(false)
            expect(store.teams.listProjectRoles('project-1')).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    id: 'implementer',
                    prototype: 'implementer',
                    source: 'builtin'
                }),
                expect.objectContaining({
                    id: 'reviewer',
                    prototype: 'reviewer',
                    source: 'builtin'
                })
            ]))
        } finally {
            db.close()
        }
    })

    it('still rejects unsupported schema versions outside the supported auto-migration path', async () => {
        const dbPath = await createTempDbPath()
        const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        db.exec('PRAGMA user_version = 6')
        db.close()

        expect(() => new Store(dbPath)).toThrow(
            'This build only runs the 7 -> 12, 8 -> 12, 9 -> 12, 10 -> 12, and 11 -> 12 migrations automatically.'
        )
    })
})
