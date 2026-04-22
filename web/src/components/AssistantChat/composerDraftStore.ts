import {
    readComposerDraftFromIndexedDb,
    removeComposerDraftFromIndexedDb,
    resetComposerDraftIndexedDbForTests,
    writeComposerDraftToIndexedDb,
} from '@/components/AssistantChat/composerDraftIndexedDb'
import {
    COMPOSER_DRAFT_TTL_MS,
    type ComposerDraftReadResult,
    type ComposerDraftRecord,
    isFreshDraftRecord,
} from '@/components/AssistantChat/composerDraftStorageShared'
import { emitDraftTrace } from '@/components/AssistantChat/composerDraftTrace'

export type { ComposerDraftReadResult }
export { COMPOSER_DRAFT_TTL_MS, readComposerDraftFromIndexedDb }

const inMemoryComposerDrafts = new Map<string, ComposerDraftRecord>()

function readComposerDraftFromMemory(sessionId: string, now: number): ComposerDraftReadResult {
    const record = inMemoryComposerDrafts.get(sessionId)
    if (!record) {
        emitDraftTrace({ type: 'read-miss', sessionId, valueLength: 0, reason: 'memory-empty' })
        return { value: null, source: null }
    }
    if (!isFreshDraftRecord(record, now) || record.value.length === 0) {
        inMemoryComposerDrafts.delete(sessionId)
        emitDraftTrace({ type: 'read-miss', sessionId, valueLength: 0, reason: 'memory-stale' })
        return { value: null, source: null }
    }

    emitDraftTrace({ type: 'read-hit', sessionId, valueLength: record.value.length, reason: 'memory-hit' })
    return { value: record.value, source: 'memory' }
}

export function readComposerDraftFromFastPath(sessionId: string, now: number): ComposerDraftReadResult {
    const memoryResult = readComposerDraftFromMemory(sessionId, now)
    if (memoryResult.value) {
        return memoryResult
    }
    return { value: null, source: null }
}

export function writeComposerDraft(sessionId: string, value: string, now: number, reason: string): void {
    if (value.length === 0) {
        emitDraftTrace({ type: 'preserve-empty', sessionId, valueLength: 0, reason })
        return
    }

    emitDraftTrace({ type: 'write', sessionId, valueLength: value.length, reason })
    const record: ComposerDraftRecord = { value, updatedAt: now }
    inMemoryComposerDrafts.set(sessionId, record)

    void writeComposerDraftToIndexedDb(sessionId, record).then((didPersist) => {
        emitDraftTrace({
            type: didPersist ? 'write-confirmed' : 'write-failed',
            sessionId,
            valueLength: value.length,
            reason: `${reason}:indexeddb`,
        })
    })
}

function removeComposerDraft(sessionId: string, reason: string): void {
    emitDraftTrace({ type: 'remove', sessionId, valueLength: 0, reason })
    inMemoryComposerDrafts.delete(sessionId)
    void removeComposerDraftFromIndexedDb(sessionId)
}

export function clearComposerDraft(sessionId: string, reason: string = 'explicit-clear'): void {
    removeComposerDraft(sessionId, reason)
}

export async function seedComposerDraftForTests(sessionId: string, record: ComposerDraftRecord): Promise<void> {
    inMemoryComposerDrafts.set(sessionId, record)
    await writeComposerDraftToIndexedDb(sessionId, record)
}

export async function resetComposerDraftPersistenceForTests(): Promise<void> {
    inMemoryComposerDrafts.clear()
    await resetComposerDraftIndexedDbForTests()
}
