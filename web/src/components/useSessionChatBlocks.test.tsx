import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSessionChatBlocks } from '@/components/useSessionChatBlocks'

describe('useSessionChatBlocks', () => {
    it('assigns renderMode to transient stream blocks before they reach the view', () => {
        const { result } = renderHook(() => useSessionChatBlocks({
            sessionId: 'session-1',
            messages: [],
            agentState: null,
            stream: {
                streamId: 'stream-1',
                startedAt: 1_000,
                updatedAt: 1_100,
                text: '# streaming heading',
            },
        }))

        expect(result.current.blocks).toMatchObject([{
            kind: 'agent-text',
            id: 'stream:stream-1',
            text: '# streaming heading',
            renderMode: 'markdown',
        }])
    })
})
