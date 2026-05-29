import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSessionTranscriptModel } from '@/components/useSessionTranscriptModel'
import type { ClientMessage } from '@/types/api'

function createUserMessage(id: string, text: string, seq?: number): ClientMessage {
    return {
        id,
        sessionId: 'session-1',
        role: 'user',
        kind: 'text',
        body: { text },
        createdAt: 1_000 + (seq ?? Number.parseInt(id.replace(/\D/g, ''), 10)),
        updatedAt: 1_000 + (seq ?? Number.parseInt(id.replace(/\D/g, ''), 10)),
        seq: seq ?? Number.parseInt(id.replace(/\D/g, ''), 10),
    } as unknown as ClientMessage
}

describe('useSessionTranscriptModel', () => {
    it('assigns renderMode to transient stream rows before they reach the view', () => {
        const { result } = renderHook(() =>
            useSessionTranscriptModel({
                sessionId: 'session-1',
                messages: [],
                agentState: null,
                replyingPhase: null,
                stream: {
                    assistantTurnId: 'stream-1',
                    startedAt: 1_000,
                    updatedAt: 1_100,
                    text: '# streaming heading',
                },
            })
        )

        expect(result.current.rows).toMatchObject([
            {
                type: 'assistant-text',
                id: 'assistant:stream:stream-1',
                copyText: '# streaming heading',
                block: {
                    text: '# streaming heading',
                    renderMode: 'markdown',
                },
            },
        ])
        expect(result.current.renderRows).toMatchObject([
            {
                gap: 'none',
                row: {
                    id: 'assistant:stream:stream-1',
                },
            },
        ])
    })

    it('marks only tail-appended rows as fresh and leaves previously seen rows untouched', () => {
        const initialMessages = [createUserMessage('m1', 'first', 2)]
        const nextMessages = [createUserMessage('m1', 'first', 2), createUserMessage('m2', 'second', 3)]
        const { result, rerender } = renderHook(
            ({ messages }: { messages: ClientMessage[] }) =>
                useSessionTranscriptModel({
                    sessionId: 'session-1',
                    messages,
                    agentState: null,
                    replyingPhase: null,
                    stream: null,
                }),
            { initialProps: { messages: initialMessages } }
        )

        // First batch (cold mount) must not animate every historical row: freshRowIds is empty.
        expect(result.current.freshRowIds.size).toBe(0)
        const firstRowId = result.current.rows[0]?.id
        expect(firstRowId).toBeDefined()

        rerender({ messages: nextMessages })

        // Only the genuinely tail-appended row is fresh; the previously seen row stays static.
        const freshIds = result.current.freshRowIds
        expect(freshIds.has(firstRowId!)).toBe(false)
        const newRowId = result.current.rows.find((row) => row.id !== firstRowId)?.id
        expect(newRowId).toBeDefined()
        expect(freshIds.has(newRowId!)).toBe(true)
    })

    it('does not mark prepended (older history) rows as fresh', () => {
        // Simulate reverse infinite scroll: the existing tail message stays in place
        // and an older message arrives in front of it. The newly visible historical
        // row must NOT animate — only tail-append rows are eligible.
        const initialMessages = [createUserMessage('m2', 'second', 2)]
        const prependedMessages = [createUserMessage('m1', 'older', 1), createUserMessage('m2', 'second', 2)]
        const { result, rerender } = renderHook(
            ({ messages }: { messages: ClientMessage[] }) =>
                useSessionTranscriptModel({
                    sessionId: 'session-1',
                    messages,
                    agentState: null,
                    replyingPhase: null,
                    stream: null,
                }),
            { initialProps: { messages: initialMessages } }
        )

        expect(result.current.freshRowIds.size).toBe(0)
        const tailRowId = result.current.rows.at(-1)?.id
        expect(tailRowId).toBeDefined()

        rerender({ messages: prependedMessages })

        // Tail did not move past the previous tail id → no fresh rows.
        expect(result.current.freshRowIds.size).toBe(0)
    })

    it('resets the fresh-row baseline when the session id changes', () => {
        const { result, rerender } = renderHook(
            ({ sessionId }: { sessionId: string }) =>
                useSessionTranscriptModel({
                    sessionId,
                    messages: [createUserMessage('m1', 'first')],
                    agentState: null,
                    replyingPhase: null,
                    stream: null,
                }),
            { initialProps: { sessionId: 'session-1' } }
        )
        expect(result.current.freshRowIds.size).toBe(0)

        rerender({ sessionId: 'session-2' })

        // After switching sessions, freshRowIds resets to empty so the new session's
        // existing transcript renders instantly without staging per-row motion.
        expect(result.current.freshRowIds.size).toBe(0)
    })
})
