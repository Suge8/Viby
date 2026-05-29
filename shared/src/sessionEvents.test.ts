import { describe, expect, it } from 'bun:test'
import { AssistantErrorEventSchema, SessionAgentKnownEventSchema } from './sessionEvents'

describe('sessionEvents', () => {
    it('keeps assistant-error as a shared transcript event contract', () => {
        expect(AssistantErrorEventSchema.parse({ type: 'assistant-error', detail: 'Pi turn failed' })).toEqual({
            type: 'assistant-error',
            detail: 'Pi turn failed',
        })
        expect(SessionAgentKnownEventSchema.parse({ type: 'ready' })).toEqual({ type: 'ready' })
    })
})
