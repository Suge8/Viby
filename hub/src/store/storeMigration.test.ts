import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Store } from './index'
import { AUTO_MIGRATABLE_SCHEMA_VERSION_LABEL, createStoreSchema, SCHEMA_VERSION } from './storeSchemaDefinition'

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

function getStoreDatabase(store: Store): Database {
    return (store as unknown as { db: Database }).db
}

describe('store schema migration', () => {
    it('migrates the previous schema stamp to v15 and normalizes legacy runtime handle fields', async () => {
        const dbPath = await createTempDbPath()
        const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        createStoreSchema(db)
        db.exec('PRAGMA user_version = 14')
        db.prepare(`
            INSERT INTO sessions (
                id, tag, machine_id, created_at, updated_at,
                metadata, metadata_version,
                agent_state, agent_state_version,
                model, model_reasoning_effort,
                permission_mode, collaboration_mode,
                next_message_seq,
                todos, todos_updated_at,
                latest_activity_at, latest_activity_kind, latest_completed_reply_at,
                active, active_at, seq
            ) VALUES (
                @id, @tag, @machine_id, @created_at, @updated_at,
                @metadata, @metadata_version,
                @agent_state, @agent_state_version,
                @model, @model_reasoning_effort,
                @permission_mode, @collaboration_mode,
                @next_message_seq,
                @todos, @todos_updated_at,
                @latest_activity_at, @latest_activity_kind, @latest_completed_reply_at,
                @active, @active_at, @seq
            )
        `).run({
            id: 'legacy-contract-session',
            tag: 'legacy-contract',
            machine_id: 'machine-1',
            created_at: 1_000,
            updated_at: 2_000,
            metadata: JSON.stringify({
                path: '/tmp/project',
                host: 'localhost',
                driver: 'cursor',
                codexSessionId: 'codex-thread-1',
                cursorSessionId: 'cursor-thread-1',
            }),
            metadata_version: 1,
            agent_state: null,
            agent_state_version: 1,
            model: null,
            model_reasoning_effort: null,
            permission_mode: 'default',
            collaboration_mode: null,
            next_message_seq: 1,
            todos: null,
            todos_updated_at: null,
            latest_activity_at: null,
            latest_activity_kind: null,
            latest_completed_reply_at: null,
            active: 0,
            active_at: null,
            seq: 1,
        })
        db.close()

        const store = new Store(dbPath)
        const migratedDb = getStoreDatabase(store)
        try {
            const session = store.sessions.getSession('legacy-contract-session')
            expect(session).toMatchObject({
                id: 'legacy-contract-session',
                metadataVersion: 2,
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'cursor',
                    runtimeHandles: {
                        codex: { sessionId: 'codex-thread-1' },
                        cursor: { sessionId: 'cursor-thread-1' },
                    },
                },
            })
            const migratedMetadata = session?.metadata as {
                codexSessionId?: unknown
                cursorSessionId?: unknown
            } | null
            expect(migratedMetadata?.codexSessionId).toBeUndefined()
            expect(migratedMetadata?.cursorSessionId).toBeUndefined()

            const userVersion = migratedDb.prepare('PRAGMA user_version').get() as { user_version: number }
            expect(userVersion.user_version).toBe(SCHEMA_VERSION)
        } finally {
            store.close()
        }
    })

    it('rejects schema versions outside the supported auto-migration window', async () => {
        const dbPath = await createTempDbPath()
        const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        db.exec('PRAGMA user_version = 13')
        db.close()

        expect(() => new Store(dbPath)).toThrow(
            `This build only runs the ${AUTO_MIGRATABLE_SCHEMA_VERSION_LABEL} migrations automatically.`
        )
    })

    it('migrates legacy device rows into the v20 presence model by adding columns and purging scan + revoked tombstones', async () => {
        const dbPath = await createTempDbPath()
        const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        // Recreate the v18 device_auth_devices shape (no platform/channel columns).
        db.exec(`
            CREATE TABLE device_auth_devices (
                id TEXT PRIMARY KEY,
                name TEXT,
                token_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL,
                revoked_at INTEGER
            );
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY, tag TEXT, machine_id TEXT,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
                metadata TEXT, metadata_version INTEGER DEFAULT 1,
                agent_state TEXT, agent_state_version INTEGER DEFAULT 1,
                model TEXT, model_reasoning_effort TEXT, codex_service_tier TEXT,
                permission_mode TEXT, collaboration_mode TEXT,
                next_message_seq INTEGER NOT NULL DEFAULT 1,
                todos TEXT, todos_updated_at INTEGER,
                latest_activity_at INTEGER, latest_activity_kind TEXT, latest_completed_reply_at INTEGER,
                active INTEGER DEFAULT 0, active_at INTEGER, seq INTEGER DEFAULT 0
            );
            CREATE TABLE machines (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, metadata TEXT, metadata_version INTEGER DEFAULT 1, runtime_state TEXT, runtime_state_version INTEGER DEFAULT 1, active INTEGER DEFAULT 0, active_at INTEGER, seq INTEGER DEFAULT 0);
            CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, seq INTEGER NOT NULL, local_id TEXT, invoked_at INTEGER);
            CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(endpoint));
        `)
        db.exec(
            `INSERT INTO device_auth_devices (id, name, token_hash, created_at, last_seen_at, revoked_at) VALUES
                ('pairing:p1', '公网扫码设备', 'hash1', 1, 1, NULL),
                ('abc-uuid', 'Phone', 'hash2', 2, 2, NULL),
                ('zombie', 'OldPhone', 'hash3', 3, 3, 4)`
        )
        db.exec('PRAGMA user_version = 18')
        db.close()

        const store = new Store(dbPath)
        const migratedDb = getStoreDatabase(store)
        try {
            const rows = migratedDb
                .prepare('SELECT id, name, platform, channel FROM device_auth_devices ORDER BY id')
                .all() as Array<{ id: string; name: string | null; platform: string | null; channel: string | null }>
            // v20 presence cleanup removes both legacy soft-revoked rows and any
            // scan-channel rows so the new bridge-driven presence is the only truth.
            expect(rows).toEqual([{ id: 'abc-uuid', name: 'Phone', platform: null, channel: 'link' }])
            const userVersion = migratedDb.prepare('PRAGMA user_version').get() as { user_version: number }
            expect(userVersion.user_version).toBe(SCHEMA_VERSION)
        } finally {
            store.close()
        }
    })

    it('closes the store database handle idempotently', async () => {
        const dbPath = await createTempDbPath()
        const store = new Store(dbPath)

        store.close()
        store.close()

        const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        try {
            const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
            expect(row.user_version).toBe(SCHEMA_VERSION)
        } finally {
            db.close()
        }
    })
})
