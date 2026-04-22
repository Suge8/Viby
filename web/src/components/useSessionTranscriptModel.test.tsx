import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSessionTranscriptModel } from '@/components/useSessionTranscriptModel'

describe('useSessionTranscriptModel', () => {
    it('assigns renderMode to transient stream rows before they reach the view', () => {
        const { result } = renderHook(() =>
            useSessionTranscriptModel({
                sessionId: 'session-1',
                messages: [],
                agentState: null,
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
})
