import { describe, expect, it } from 'bun:test'
import { mergeRuntimeMetadataWithSessionOwnedFields } from './runtimeMetadataMerge'

describe('mergeRuntimeMetadataWithSessionOwnedFields', () => {
    it('keeps user-owned name from current metadata', () => {
        expect(
            mergeRuntimeMetadataWithSessionOwnedFields(
                { name: 'Kept', driver: 'codex' },
                { name: 'Runtime', driver: 'claude' }
            )
        ).toEqual({ name: 'Kept', driver: 'claude' })
    })

    it('keeps lifecycle fields from current metadata', () => {
        expect(
            mergeRuntimeMetadataWithSessionOwnedFields(
                { lifecycleState: 'open', lifecycleStateSince: 10, archivedBy: 'user', archiveReason: 'done' },
                { lifecycleState: 'closed', lifecycleStateSince: 20, archivedBy: 'runtime', archiveReason: 'wrong' }
            )
        ).toEqual({ lifecycleState: 'open', lifecycleStateSince: 10, archivedBy: 'user', archiveReason: 'done' })
    })

    it('removes lifecycle fields absent from current metadata', () => {
        expect(
            mergeRuntimeMetadataWithSessionOwnedFields(
                { driver: 'codex' },
                { driver: 'codex', lifecycleState: 'closed' }
            )
        ).toEqual({
            driver: 'codex',
        })
    })
})
