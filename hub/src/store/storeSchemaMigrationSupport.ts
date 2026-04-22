import type { Database } from 'bun:sqlite'
import {
    SESSION_METADATA_RUNNER_START_FLAG_KEY,
    SESSION_METADATA_RUNTIME_HANDLE_MIGRATION_KEYS,
} from '@viby/protocol/schemas'

import { safeJsonParse } from './json'
import { REQUIRED_SESSION_COLUMNS, REQUIRED_TABLES, SCHEMA_REBUILD_GUIDANCE } from './storeSchemaDefinition'
import { isSessionMetadataRecord, normalizeLegacySessionMetadataContract } from './storeSchemaLegacyMetadata'

type DbSessionMetadataRow = {
    id: string
    metadata: string
    metadata_version: number
}

export class StoreSchemaMigrationSupport {
    constructor(private readonly db: Database) {}

    assertRequiredTablesPresent(requiredTables: readonly string[] = REQUIRED_TABLES): void {
        const placeholders = requiredTables.map(() => '?').join(', ')
        const rows = this.db
            .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
            .all(...requiredTables) as Array<{ name: string }>
        const existing = new Set(rows.map((row) => row.name))
        const missing = requiredTables.filter((table) => !existing.has(table))
        if (missing.length > 0) {
            throw new Error(
                `SQLite schema is missing required tables (${missing.join(', ')}). ${SCHEMA_REBUILD_GUIDANCE}`
            )
        }
    }

    normalizeLegacySessionMetadataContracts(): void {
        const runtimeHandleFieldPredicates = Object.values(SESSION_METADATA_RUNTIME_HANDLE_MIGRATION_KEYS)
            .map((field) => `OR json_type(metadata, '$.${field}') = 'text'`)
            .join('\n                 ')
        const rows = this.db
            .prepare(`
            SELECT id, metadata, metadata_version
            FROM sessions
            WHERE metadata IS NOT NULL
              AND json_valid(metadata)
              AND (
                    json_type(metadata, '$.${SESSION_METADATA_RUNNER_START_FLAG_KEY}') IS NOT NULL
                 ${runtimeHandleFieldPredicates}
              )
        `)
            .all() as DbSessionMetadataRow[]
        const update = this.db.prepare(`
            UPDATE sessions
            SET metadata = @metadata,
                metadata_version = @metadata_version
            WHERE id = @id
        `)

        for (const row of rows) {
            const metadata = safeJsonParse(row.metadata)
            if (!isSessionMetadataRecord(metadata)) {
                continue
            }

            const nextMetadata = normalizeLegacySessionMetadataContract(metadata)
            if (JSON.stringify(nextMetadata) === JSON.stringify(metadata)) {
                continue
            }

            update.run({
                id: row.id,
                metadata: JSON.stringify(nextMetadata),
                metadata_version: row.metadata_version + 1,
            })
        }
    }

    assertRequiredSessionColumnsPresent(): void {
        const missingColumns = this.getMissingTableColumns('sessions', REQUIRED_SESSION_COLUMNS)
        if (missingColumns.length > 0) {
            throw new Error(
                `SQLite schema is missing required session columns (${missingColumns.join(', ')}). ${SCHEMA_REBUILD_GUIDANCE}`
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
}
