import { describe, expect, it } from 'vitest'
import { resolveAssistantReplyingPhase } from '@/components/AssistantChat/assistantReplyingPhase'

describe('resolveAssistantReplyingPhase', () => {
    it('keeps replying active while the session is still thinking', () => {
        expect(resolveAssistantReplyingPhase({
            isResponding: true,
            pendingReply: {
                localId: 'local-1',
                requestStartedAt: 1_000,
                serverAcceptedAt: 1_100,
                phase: 'preparing'
            }
        })).toBe('replying')
    })

    it('falls back to the optimistic pending phase before runtime thinking becomes visible', () => {
        expect(resolveAssistantReplyingPhase({
            isResponding: false,
            pendingReply: {
                localId: 'local-1',
                requestStartedAt: 1_000,
                serverAcceptedAt: null,
                phase: 'sending'
            }
        })).toBe('sending')
    })

    it('clears the indicator once neither pending send nor thinking is active', () => {
        expect(resolveAssistantReplyingPhase({
            isResponding: false,
            pendingReply: null
        })).toBeNull()
    })
})
