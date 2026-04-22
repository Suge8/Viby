import { AGENT_FLAVORS, resolveSessionDriver, setSessionDriverRuntimeHandle } from '@viby/protocol'
import {
    SESSION_METADATA_RUNNER_START_FLAG_KEY,
    SESSION_METADATA_RUNTIME_HANDLE_MIGRATION_KEYS,
} from '@viby/protocol/schemas'
import type { Metadata } from '@viby/protocol/types'

export type SessionMetadataRecord = Record<string, unknown> &
    Partial<Pick<Metadata, 'driver' | 'runtimeHandles' | 'startedBy'>>

export function isSessionMetadataRecord(value: unknown): value is SessionMetadataRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeLegacySessionMetadataContract(metadata: SessionMetadataRecord): SessionMetadataRecord {
    const legacyMetadata = { ...metadata }
    const runnerStartFlag = legacyMetadata[SESSION_METADATA_RUNNER_START_FLAG_KEY]
    delete legacyMetadata[SESSION_METADATA_RUNNER_START_FLAG_KEY]

    let nextMetadata: SessionMetadataRecord = legacyMetadata
    const inferredDrivers: string[] = []

    for (const driver of AGENT_FLAVORS) {
        if (driver === 'copilot') {
            continue
        }

        const legacyKey =
            SESSION_METADATA_RUNTIME_HANDLE_MIGRATION_KEYS[
                driver as keyof typeof SESSION_METADATA_RUNTIME_HANDLE_MIGRATION_KEYS
            ]
        const legacySessionId = metadata[legacyKey]
        delete nextMetadata[legacyKey]
        if (typeof legacySessionId !== 'string' || legacySessionId.length === 0) {
            continue
        }

        inferredDrivers.push(driver)
        nextMetadata = setSessionDriverRuntimeHandle(nextMetadata, driver, { sessionId: legacySessionId })
    }

    if (nextMetadata.startedBy === undefined && runnerStartFlag === true) {
        nextMetadata = {
            ...nextMetadata,
            startedBy: 'runner',
        }
    }

    if (resolveSessionDriver(nextMetadata) === null && inferredDrivers.length === 1) {
        nextMetadata = {
            ...nextMetadata,
            driver: inferredDrivers[0] as Metadata['driver'],
        }
    }

    return nextMetadata
}
