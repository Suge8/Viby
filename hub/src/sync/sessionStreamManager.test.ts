import { describe, expect, it } from 'bun:test'
import { SessionStreamManager } from './sessionStreamManager'

describe('SessionStreamManager', () => {
    it('aggregates deltas into a single session stream snapshot', () => {
        const manager = new SessionStreamManager()

        const first = manager.applyUpdate('session-1', {
            kind: 'append',
            assistantTurnId: 'stream-1',
            delta: 'Hello',
        })
        const second = manager.applyUpdate('session-1', {
            kind: 'append',
            assistantTurnId: 'stream-1',
            delta: ' world',
        })

        expect(first).toMatchObject({
            type: 'session-stream-updated',
            sessionId: 'session-1',
            stream: {
                assistantTurnId: 'stream-1',
                text: 'Hello',
            },
        })
        expect(second).toMatchObject({
            type: 'session-stream-updated',
            sessionId: 'session-1',
            stream: {
                assistantTurnId: 'stream-1',
                text: 'Hello world',
            },
        })
        expect(manager.getStream('session-1')).toMatchObject({
            assistantTurnId: 'stream-1',
            text: 'Hello world',
        })
    })

    it('clears only the matching assistant turn id', () => {
        const manager = new SessionStreamManager()

        manager.applyUpdate('session-1', {
            kind: 'append',
            assistantTurnId: 'stream-1',
            delta: 'Hello',
        })

        expect(manager.clear('session-1', 'stream-2')).toBeNull()
        expect(manager.getStream('session-1')).not.toBeNull()

        expect(manager.clear('session-1', 'stream-1')).toEqual({
            type: 'session-stream-cleared',
            sessionId: 'session-1',
            assistantTurnId: 'stream-1',
        })
        expect(manager.getStream('session-1')).toBeNull()
    })
})
