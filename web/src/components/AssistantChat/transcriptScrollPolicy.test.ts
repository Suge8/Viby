import { describe, expect, it } from 'vitest'
import type { TranscriptRenderRow, TranscriptRow } from '@/chat/transcriptTypes'
import { detectPrependedTranscriptRows, shouldPrefetchOlderTranscriptRows } from './transcriptScrollPolicy'

function row(id: string): TranscriptRenderRow {
    return {
        gap: 'base',
        row: {
            id,
            type: 'assistant-text',
            conversationId: id,
            depth: 0,
            copyText: id,
            block: {
                kind: 'agent-text',
                id,
                localId: null,
                createdAt: 1,
                text: id,
                renderMode: 'plain',
            },
        } satisfies TranscriptRow,
    }
}

describe('transcript scroll policy', () => {
    it('detects a prepend even when the tail row is replaced in the same render', () => {
        expect(detectPrependedTranscriptRows([row('a'), row('stream')], [row('older'), row('a'), row('durable')])).toBe(
            1
        )
    })

    it('detects a prepend even when the total row count does not grow', () => {
        expect(detectPrependedTranscriptRows([row('a'), row('thinking')], [row('older'), row('a')])).toBe(1)
    })

    it('does not treat pure tail replacement or middle insertion as prepend', () => {
        expect(detectPrependedTranscriptRows([row('a'), row('stream')], [row('a'), row('durable')])).toBe(0)
        expect(detectPrependedTranscriptRows([row('a'), row('b')], [row('a'), row('middle'), row('b')])).toBe(0)
    })

    it('prefetches older history near the loaded window start for local and absolute indices', () => {
        expect(shouldPrefetchOlderTranscriptRows({ startIndex: 12, endIndex: 20 }, 100_000)).toBe(true)
        expect(shouldPrefetchOlderTranscriptRows({ startIndex: 100_012, endIndex: 100_020 }, 100_000)).toBe(true)
        expect(shouldPrefetchOlderTranscriptRows({ startIndex: 80, endIndex: 90 }, 100_000)).toBe(false)
    })
})
