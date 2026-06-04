import type { Database } from 'bun:sqlite'
import {
    getMachine,
    getMachines,
    getOrCreateMachine,
    updateMachineMetadata,
    updateMachineRuntimeState,
} from './machines'
import type { StoredMachine, VersionedUpdateResult } from './types'

export class MachineStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getOrCreateMachine(id: string, metadata: unknown, runtimeState: unknown): StoredMachine {
        return getOrCreateMachine(this.db, id, metadata, runtimeState)
    }

    updateMachineMetadata(
        id: string,
        metadata: unknown,
        expectedVersion: number
    ): VersionedUpdateResult<unknown | null> {
        return updateMachineMetadata(this.db, id, metadata, expectedVersion)
    }

    updateMachineRuntimeState(
        id: string,
        runtimeState: unknown,
        expectedVersion: number
    ): VersionedUpdateResult<unknown | null> {
        return updateMachineRuntimeState(this.db, id, runtimeState, expectedVersion)
    }

    getMachine(id: string): StoredMachine | null {
        return getMachine(this.db, id)
    }

    getMachines(): StoredMachine[] {
        return getMachines(this.db)
    }
}
