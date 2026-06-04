import type { PairingPeerEvent } from '@viby/protocol/pairing'
import type { SyncEvent } from '@viby/protocol/types'
import { canSendPairingPeerText, type PairingPeerTextSink, sendPairingPeerText } from './pairingBridgeControllerSupport'
import { serializePairingSyncEvent } from './pairingPeerRpcCore'

const DEFAULT_REPLAY_CAPACITY = 256

type RecordedEvent = {
    seq: number
    wire: string
}

export type PairingReplayResult = 'sent' | 'miss' | 'unavailable'

export type PairingEventReplay = {
    lastSeq(): number
    record(event: SyncEvent): string
    replayAfter(
        lastSeenSeq: number,
        sink: PairingPeerTextSink,
        reportError: (error: unknown) => void
    ): PairingReplayResult
}

function createSnapshotInvalidatedEvent(
    reason: Extract<SyncEvent, { type: 'snapshot-invalidated' }>['reason'],
    lastSeq: number
): SyncEvent {
    return { type: 'snapshot-invalidated', reason, lastSeq }
}

export function createPairingEventReplay(capacity: number = DEFAULT_REPLAY_CAPACITY): PairingEventReplay {
    let nextSeq = 1
    const ring: RecordedEvent[] = []

    function remember(wire: string): string {
        ring.push({ seq: nextSeq, wire })
        if (ring.length > capacity) ring.shift()
        nextSeq += 1
        return wire
    }

    function sendWire(sink: PairingPeerTextSink, wire: string, reportError: (error: unknown) => void): void {
        void sendPairingPeerText(sink, wire, 'bulk').catch(reportError)
    }

    function sendSnapshotInvalidated(
        sink: PairingPeerTextSink,
        reason: Extract<SyncEvent, { type: 'snapshot-invalidated' }>['reason'],
        reportError: (error: unknown) => void
    ): void {
        const lastSeq = nextSeq - 1
        sendWire(sink, serializePairingSyncEvent(createSnapshotInvalidatedEvent(reason, lastSeq)), reportError)
    }

    return {
        lastSeq: () => nextSeq - 1,
        record(event) {
            return remember(serializePairingSyncEvent(event, nextSeq))
        },
        replayAfter(lastSeenSeq, sink, reportError) {
            if (!canSendPairingPeerText(sink)) return 'unavailable'
            const lastSeq = nextSeq - 1
            const oldestSeq = ring[0]?.seq ?? nextSeq
            if (lastSeenSeq > lastSeq) {
                sendSnapshotInvalidated(sink, 'pairing-seq-drift', reportError)
                return 'miss'
            }
            if (ring.length > 0 && lastSeenSeq < oldestSeq - 1) {
                sendSnapshotInvalidated(sink, 'pairing-replay-miss', reportError)
                return 'miss'
            }
            for (const event of ring) {
                if (event.seq > lastSeenSeq) sendWire(sink, event.wire, reportError)
            }
            return 'sent'
        },
    }
}

export function readPairingEventSeq(event: PairingPeerEvent): number | null {
    return typeof event.seq === 'number' ? event.seq : null
}
