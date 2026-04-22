import {
    type ComposerDraftReadResult,
    type ComposerDraftRecord,
    isFreshDraftRecord,
} from '@/components/AssistantChat/composerDraftStorageShared'
import { emitDraftTrace } from '@/components/AssistantChat/composerDraftTrace'
import { readAppCacheRecord, removeAppCacheRecord, writeAppCacheRecord } from '@/lib/storage/appCacheDb'
import { APP_CACHE_STORES } from '@/lib/storage/storageRegistry'

const pendingIndexedDbMutations = new Map<string, Promise<void>>()

export async function readComposerDraftFromIndexedDb(sessionId: string, now: number): Promise<ComposerDraftReadResult> {
    const record = await readAppCacheRecord(APP_CACHE_STORES.composerDrafts, sessionId)
    if (!record) {
        emitDraftTrace({ type: 'read-miss', sessionId, valueLength: 0, reason: 'indexeddb-empty' })
        return { value: null, source: null }
    }

    if (
        typeof record.value !== 'string' ||
        typeof record.updatedAt !== 'number' ||
        !Number.isFinite(record.updatedAt)
    ) {
        void removeComposerDraftFromIndexedDb(sessionId)
        emitDraftTrace({ type: 'read-miss', sessionId, valueLength: 0, reason: 'indexeddb-invalid' })
        return { value: null, source: null }
    }
    if (record.value.length === 0) {
        void removeComposerDraftFromIndexedDb(sessionId)
        emitDraftTrace({ type: 'read-miss', sessionId, valueLength: 0, reason: 'indexeddb-empty-record' })
        return { value: null, source: null }
    }
    if (!isFreshDraftRecord(record, now)) {
        void removeComposerDraftFromIndexedDb(sessionId)
        emitDraftTrace({ type: 'read-miss', sessionId, valueLength: 0, reason: 'indexeddb-expired' })
        return { value: null, source: null }
    }

    emitDraftTrace({
        type: 'read-hit',
        sessionId,
        valueLength: record.value.length,
        reason: 'indexeddb-hit',
    })
    return { value: record.value, source: 'indexeddb' }
}

function queueIndexedDbMutation<T>(sessionId: string, mutation: () => Promise<T>): Promise<T> {
    const previous = pendingIndexedDbMutations.get(sessionId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(mutation)
    const tracked = next.then(
        () => undefined,
        () => undefined
    )
    pendingIndexedDbMutations.set(sessionId, tracked)
    return next.finally(() => {
        if (pendingIndexedDbMutations.get(sessionId) === tracked) {
            pendingIndexedDbMutations.delete(sessionId)
        }
    })
}

export function writeComposerDraftToIndexedDb(sessionId: string, record: ComposerDraftRecord): Promise<boolean> {
    return queueIndexedDbMutation(sessionId, async () => {
        return await writeAppCacheRecord(APP_CACHE_STORES.composerDrafts, sessionId, record)
    })
}

export function removeComposerDraftFromIndexedDb(sessionId: string): Promise<void> {
    return queueIndexedDbMutation(sessionId, async () => {
        await removeAppCacheRecord(APP_CACHE_STORES.composerDrafts, sessionId)
    })
}

export async function resetComposerDraftIndexedDbForTests(): Promise<void> {
    await Promise.all([...pendingIndexedDbMutations.values()].map((mutation) => mutation.catch(() => undefined)))
    pendingIndexedDbMutations.clear()
}
