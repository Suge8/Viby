export const COMPOSER_DRAFT_TTL_MS = 24 * 60 * 60 * 1000

export type ComposerDraftRecord = {
    value: string
    updatedAt: number
}

export type ComposerDraftReadResult = {
    value: string | null
    source: 'memory' | 'indexeddb' | null
}

export function isFreshDraftRecord(record: ComposerDraftRecord, now: number): boolean {
    return now - record.updatedAt <= COMPOSER_DRAFT_TTL_MS
}
