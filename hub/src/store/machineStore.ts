import type { Database } from 'bun:sqlite'

import type { StoredMachine, VersionedUpdateResult } from './types'
import {
    getMachine,
    getMachines,
    getOrCreateMachine,
    updateMachineRunnerState,
    updateMachineMetadata
} from './machines'

export class MachineStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getOrCreateMachine(id: string, metadata: unknown, runnerState: unknown): StoredMachine {
        return getOrCreateMachine(this.db, id, metadata, runnerState)
    }

    updateMachineMetadata(
        id: string,
        metadata: unknown,
        expectedVersion: number
    ): VersionedUpdateResult<unknown | null> {
        return updateMachineMetadata(this.db, id, metadata, expectedVersion)
    }

    updateMachineRunnerState(
        id: string,
        runnerState: unknown,
        expectedVersion: number
    ): VersionedUpdateResult<unknown | null> {
        return updateMachineRunnerState(this.db, id, runnerState, expectedVersion)
    }

    getMachine(id: string): StoredMachine | null {
        return getMachine(this.db, id)
    }

    getMachines(): StoredMachine[] {
        return getMachines(this.db)
    }
}
