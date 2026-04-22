import type { Database } from 'bun:sqlite'
import {
    buildSchemaMismatchError,
    createStoreSchema,
    isAutoMigratableSchemaVersion,
    LEGACY_REQUIRED_TABLES,
    SCHEMA_VERSION,
} from './storeSchemaDefinition'
import { StoreSchemaMigrationSupport } from './storeSchemaMigrationSupport'

export function initializeStoreSchema(db: Database, dbPath: string): void {
    new StoreSchemaManager(db, dbPath).init()
}

export class StoreSchemaManager {
    private readonly migrationSupport: StoreSchemaMigrationSupport

    constructor(
        private readonly db: Database,
        private readonly dbPath: string
    ) {
        this.migrationSupport = new StoreSchemaMigrationSupport(db)
    }

    init(): void {
        const currentVersion = this.getUserVersion()
        if (currentVersion === 0) {
            if (this.hasAnyUserTables()) {
                throw buildSchemaMismatchError(this.dbPath, currentVersion)
            }

            createStoreSchema(this.db)
            this.setUserVersion(SCHEMA_VERSION)
            return
        }

        if (currentVersion === SCHEMA_VERSION) {
            this.migrationSupport.normalizeLegacySessionMetadataContracts()
        } else {
            this.migrateSchema(currentVersion)
        }
        this.migrationSupport.assertRequiredTablesPresent()
        this.migrationSupport.assertRequiredSessionColumnsPresent()
    }

    private getUserVersion(): number {
        const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
        return row?.user_version ?? 0
    }

    private setUserVersion(version: number): void {
        this.db.exec(`PRAGMA user_version = ${version}`)
    }

    private hasAnyUserTables(): boolean {
        const row = this.db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1")
            .get() as { name?: string } | undefined
        return Boolean(row?.name)
    }

    private migrateSchema(currentVersion: number): void {
        if (!isAutoMigratableSchemaVersion(currentVersion)) {
            throw buildSchemaMismatchError(this.dbPath, currentVersion)
        }

        this.migrationSupport.assertRequiredTablesPresent(LEGACY_REQUIRED_TABLES)
        this.migrationSupport.assertRequiredSessionColumnsPresent()
        this.db.exec('BEGIN IMMEDIATE')

        try {
            createStoreSchema(this.db)
            this.migrationSupport.normalizeLegacySessionMetadataContracts()
            this.setUserVersion(SCHEMA_VERSION)
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            throw error
        }
    }
}
