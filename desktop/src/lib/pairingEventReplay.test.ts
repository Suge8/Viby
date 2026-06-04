import { describe, expect, it } from 'bun:test'
import { PairingPeerMessageSchema } from '@viby/protocol/pairing'
import type { SyncEvent } from '@viby/protocol/types'
import { createPairingEventReplay } from './pairingEventReplay'
import type { PairingPeerTextSink } from './pairingPeerPayloadSupport'

function sink(sent: string[]): PairingPeerTextSink {
    return {
        readyState: 'open',
        send: (data) => sent.push(data),
    } as PairingPeerTextSink
}

function event(machineId: string): SyncEvent {
    return { type: 'machine-updated', machineId }
}

function parseWire(raw: string) {
    return PairingPeerMessageSchema.parse(JSON.parse(raw))
}

describe('createPairingEventReplay', () => {
    it('replays bounded events after the peer cursor', () => {
        const replay = createPairingEventReplay(4)
        const sent: string[] = []
        replay.record(event('m1'))
        replay.record(event('m2'))

        expect(replay.replayAfter(1, sink(sent), () => {})).toBe('sent')

        expect(sent.map(parseWire)).toEqual([{ kind: 'event', event: 'sync-event', payload: event('m2'), seq: 2 }])
    })

    it('sends snapshot invalidation when the peer cursor fell out of the replay window', () => {
        const replay = createPairingEventReplay(2)
        const sent: string[] = []
        replay.record(event('m1'))
        replay.record(event('m2'))
        replay.record(event('m3'))

        expect(replay.replayAfter(0, sink(sent), () => {})).toBe('miss')

        expect(parseWire(sent[0] ?? '{}')).toEqual({
            kind: 'event',
            event: 'sync-event',
            payload: { type: 'snapshot-invalidated', reason: 'pairing-replay-miss', lastSeq: 3 },
        })
    })

    it('resets peers that report a future cursor', () => {
        const replay = createPairingEventReplay(2)
        const sent: string[] = []
        replay.record(event('m1'))

        expect(replay.replayAfter(99, sink(sent), () => {})).toBe('miss')

        expect(parseWire(sent[0] ?? '{}')).toEqual({
            kind: 'event',
            event: 'sync-event',
            payload: { type: 'snapshot-invalidated', reason: 'pairing-seq-drift', lastSeq: 1 },
        })
    })

    it('keeps repeated reconnect replay deterministic for the same cursor', () => {
        const replay = createPairingEventReplay(4)
        const first: string[] = []
        const second: string[] = []
        replay.record(event('m1'))
        replay.record(event('m2'))
        replay.record(event('m3'))

        expect(replay.replayAfter(1, sink(first), () => {})).toBe('sent')
        expect(replay.replayAfter(1, sink(second), () => {})).toBe('sent')

        expect(first.map(parseWire)).toEqual(second.map(parseWire))
        expect(first.map(parseWire).map((message) => message.seq)).toEqual([2, 3])
    })
})
