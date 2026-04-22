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
                startedFromRunner: true,
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
                    startedBy: 'runner',
                    runtimeHandles: {
                        codex: { sessionId: 'codex-thread-1' },
                        cursor: { sessionId: 'cursor-thread-1' },
                    },
                },
            })
            const migratedMetadata = session?.metadata as {
                startedFromRunner?: unknown
                codexSessionId?: unknown
                cursorSessionId?: unknown
            } | null
            expect(migratedMetadata?.startedFromRunner).toBeUndefined()
            expect(migratedMetadata?.codexSessionId).toBeUndefined()
            expect(migratedMetadata?.cursorSessionId).toBeUndefined()

            const userVersion = migratedDb.prepare('PRAGMA user_version').get() as { user_version: number }
            expect(userVersion.user_version).toBe(SCHEMA_VERSION)
        } finally {
            migratedDb.close()
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
})
