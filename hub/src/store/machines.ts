import type { Database } from 'bun:sqlite'

import { safeJsonParse } from './json'
import type { StoredMachine, VersionedUpdateResult } from './types'
import { updateVersionedField } from './versionedUpdates'

type DbMachineRow = {
    id: string
    created_at: number
    updated_at: number
    metadata: string | null
    metadata_version: number
    runner_state: string | null
    runner_state_version: number
    active: number
    active_at: number | null
    seq: number
}

function toStoredMachine(row: DbMachineRow): StoredMachine {
    return {
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: safeJsonParse(row.metadata),
        metadataVersion: row.metadata_version,
        runnerState: safeJsonParse(row.runner_state),
        runnerStateVersion: row.runner_state_version,
        active: row.active === 1,
        activeAt: row.active_at,
        seq: row.seq
    }
}

export function getOrCreateMachine(
    db: Database,
    id: string,
    metadata: unknown,
    runnerState: unknown
): StoredMachine {
    const existing = db.query('SELECT * FROM machines WHERE id = ?').get(id) as DbMachineRow | undefined
    if (existing) {
        return toStoredMachine(existing)
    }

    const now = Date.now()
    const metadataJson = JSON.stringify(metadata)
    const runnerStateJson = runnerState === null || runnerState === undefined ? null : JSON.stringify(runnerState)

    db.query(`
        INSERT INTO machines (
            id, created_at, updated_at,
            metadata, metadata_version,
            runner_state, runner_state_version,
            active, active_at, seq
        ) VALUES (
            @id, @created_at, @updated_at,
            @metadata, 1,
            @runner_state, 1,
            0, NULL, 0
        )
    `).run({
        id,
        created_at: now,
        updated_at: now,
        metadata: metadataJson,
        runner_state: runnerStateJson
    })

    const row = getMachine(db, id)
    if (!row) {
        throw new Error('Failed to create machine')
    }
    return row
}

export function updateMachineMetadata(
    db: Database,
    id: string,
    metadata: unknown,
    expectedVersion: number
): VersionedUpdateResult<unknown | null> {
    const now = Date.now()

    return updateVersionedField({
        db,
        table: 'machines',
        id,
        field: 'metadata',
        versionField: 'metadata_version',
        expectedVersion,
        value: metadata,
        encode: (value) => {
            const json = JSON.stringify(value)
            return json === undefined ? null : json
        },
        decode: safeJsonParse,
        setClauses: ['updated_at = @updated_at', 'seq = seq + 1'],
        params: { updated_at: now }
    })
}

export function updateMachineRunnerState(
    db: Database,
    id: string,
    runnerState: unknown,
    expectedVersion: number
): VersionedUpdateResult<unknown | null> {
    const now = Date.now()
    const normalized = runnerState ?? null

    return updateVersionedField({
        db,
        table: 'machines',
        id,
        field: 'runner_state',
        versionField: 'runner_state_version',
        expectedVersion,
        value: normalized,
        encode: (value) => (value === null ? null : JSON.stringify(value)),
        decode: safeJsonParse,
        setClauses: [
            'updated_at = @updated_at',
            'active = 1',
            'active_at = @active_at',
            'seq = seq + 1'
        ],
        params: { updated_at: now, active_at: now }
    })
}

export function getMachine(db: Database, id: string): StoredMachine | null {
    const row = db.query('SELECT * FROM machines WHERE id = ?').get(id) as DbMachineRow | undefined
    return row ? toStoredMachine(row) : null
}

export function getMachines(db: Database): StoredMachine[] {
    const rows = db.query('SELECT * FROM machines ORDER BY updated_at DESC').all() as DbMachineRow[]
    return rows.map(toStoredMachine)
}
