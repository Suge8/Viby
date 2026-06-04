import { describe, expect, it } from 'bun:test'
import { PairingPeerMessageSchema } from '@viby/protocol/pairing'
import type { SyncEvent } from '@viby/protocol/types'
import { createPairingEventBroadcaster } from './pairingEventBroadcaster'
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

describe('createPairingEventBroadcaster', () => {
    it('uses one Hub event stream and fans out one sequenced event to every sink', () => {
        let streamCalls = 0
        let streamSignal: AbortSignal | null = null
        let onPayload: ((payload: { type: 'event'; event: SyncEvent }) => void) | null = null
        const firstSent: string[] = []
        const secondSent: string[] = []
        const broadcaster = createPairingEventBroadcaster({
            getClient: () =>
                ({
                    streamEvents: async (options) => {
                        streamCalls += 1
                        streamSignal = options.signal
                        onPayload = options.onPayload
                        await new Promise<void>((resolve) => options.signal.addEventListener('abort', () => resolve()))
                    },
                }) as never,
            reportError: () => {},
        })

        const removeFirst = broadcaster.addSink('first', sink(firstSent), () => {})
        const removeSecond = broadcaster.addSink('second', sink(secondSent), () => {})
        onPayload?.({ type: 'event', event: event('m1') })

        expect(streamCalls).toBe(1)
        expect(firstSent).toHaveLength(1)
        expect(secondSent).toHaveLength(1)
        expect(PairingPeerMessageSchema.parse(JSON.parse(firstSent[0] ?? '{}'))).toEqual(
            PairingPeerMessageSchema.parse(JSON.parse(secondSent[0] ?? '{}'))
        )
        expect(PairingPeerMessageSchema.parse(JSON.parse(firstSent[0] ?? '{}'))).toMatchObject({ seq: 1 })

        removeFirst()
        onPayload?.({ type: 'event', event: event('m2') })
        expect(firstSent).toHaveLength(1)
        expect(secondSent).toHaveLength(2)

        removeSecond()
        expect(streamSignal?.aborted).toBe(true)
    })
})
