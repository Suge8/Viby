import { describe, expect, it } from 'bun:test'
import { AssistantErrorEventSchema, SessionAgentKnownEventSchema, TurnTerminalEventSchema } from './sessionEvents'

describe('sessionEvents', () => {
    it('keeps assistant-error as a shared transcript event contract', () => {
        expect(AssistantErrorEventSchema.parse({ type: 'assistant-error', detail: 'Pi turn failed' })).toEqual({
            type: 'assistant-error',
            detail: 'Pi turn failed',
        })
        expect(SessionAgentKnownEventSchema.parse({ type: 'ready' })).toEqual({ type: 'ready' })
    })

    it('keeps provider terminal reasons as durable transcript events', () => {
        const event = {
            type: 'turn-terminal',
            provider: 'pi',
            status: 'truncated',
            reason: 'length',
            assistantTurnId: 'pi-assistant-1',
        } as const

        expect(TurnTerminalEventSchema.parse(event)).toEqual(event)
        expect(SessionAgentKnownEventSchema.parse(event)).toEqual(event)
    })
})
