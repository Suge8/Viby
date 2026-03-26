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

function getStoreDatabase(store: Store): Database {
    return (store as unknown as { db: Database }).db
}

describe('store schema migration', () => {
    it('migrates a v7 sessions table to v9 without losing session config state', async () => {
        const dbPath = await createTempDbPath()
        createLegacySchemaV7(dbPath)

        const store = new Store(dbPath)
        const db = getStoreDatabase(store)
        try {
            const userVersion = db.prepare('PRAGMA user_version').get() as { user_version: number }
            const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>

            expect(userVersion.user_version).toBe(9)
            expect(sessionColumns.map((column) => column.name)).toEqual(
                expect.arrayContaining(['permission_mode', 'collaboration_mode', 'next_message_seq'])
            )

            const legacySession = store.sessions.getSession('legacy-session')
            expect(legacySession).toMatchObject({
                id: 'legacy-session',
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                permissionMode: null,
                collaborationMode: null
            })

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

    it('migrates a v8 sessions table to v9 and backfills next_message_seq', async () => {
        const dbPath = await createTempDbPath()
        createLegacySchemaV8(dbPath)

        const store = new Store(dbPath)
        const db = getStoreDatabase(store)
        try {
            const userVersion = db.prepare('PRAGMA user_version').get() as { user_version: number }
            const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>

            expect(userVersion.user_version).toBe(9)
            expect(sessionColumns.map((column) => column.name)).toContain('next_message_seq')

            const message = store.messages.addMessage('legacy-session-v8', { role: 'user', content: [] })
            expect(message.seq).toBe(8)
        } finally {
            db.close()
        }
    })

    it('still rejects unsupported schema versions outside the v7 to v8 migration path', async () => {
        const dbPath = await createTempDbPath()
        const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        db.exec('PRAGMA user_version = 6')
        db.close()

        expect(() => new Store(dbPath)).toThrow(
            'This build only runs the 7 -> 9 and 8 -> 9 migrations automatically.'
        )
    })
})
