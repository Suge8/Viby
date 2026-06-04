import { describe, expect, it } from 'vitest'
import { AssistantStreamBridge } from './assistantStreamBridge'

describe('AssistantStreamBridge', () => {
    it('clears stale stream when durable turn id differs', () => {
        const clears: Array<{ assistantTurnId?: string }> = []
        const bridge = new AssistantStreamBridge({
            append: () => {},
            clear: (update) => clears.push(update),
        })

        bridge.beginAssistantTurn('stream-1')
        bridge.acknowledgeDurableTurn('durable-1')

        expect(clears).toEqual([{ assistantTurnId: 'stream-1' }])
    })

    it('clears stale stream before a new explicit stream id', () => {
        const appends: Array<{ assistantTurnId: string; delta: string }> = []
        const clears: Array<{ assistantTurnId?: string }> = []
        const bridge = new AssistantStreamBridge({
            append: (update) => appends.push(update),
            clear: (update) => clears.push(update),
        })

        bridge.appendTextDelta('old', 'stream-1')
        bridge.appendTextDelta('new', 'stream-2')

        expect(clears).toEqual([{ assistantTurnId: 'stream-1' }])
        expect(appends).toEqual([
            { assistantTurnId: 'stream-1', delta: 'old' },
            { assistantTurnId: 'stream-2', delta: 'new' },
        ])
    })
})
