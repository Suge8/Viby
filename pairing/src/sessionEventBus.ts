import type { PairingHostEvent } from '@viby/protocol/pairing'

type PairingEventListener = (event: PairingHostEvent) => void

/**
 * In-process pub/sub for host-side `pairing.updated` events. The broker
 * currently runs as a single process; if it later fans out to multiple
 * instances, replace this with a Redis pub/sub adapter behind the same
 * interface.
 */
export class PairingSessionEventBus {
    private readonly listeners = new Map<string, Set<PairingEventListener>>()

    subscribe(pairingId: string, listener: PairingEventListener): () => void {
        let bucket = this.listeners.get(pairingId)
        if (!bucket) {
            bucket = new Set()
            this.listeners.set(pairingId, bucket)
        }
        bucket.add(listener)
        return () => {
            const current = this.listeners.get(pairingId)
            if (!current) return
            current.delete(listener)
            if (current.size === 0) this.listeners.delete(pairingId)
        }
    }

    emit(event: PairingHostEvent): void {
        const bucket = this.listeners.get(event.pairing.id)
        if (!bucket || bucket.size === 0) return
        for (const listener of bucket) listener(event)
    }

    listenerCount(pairingId: string): number {
        return this.listeners.get(pairingId)?.size ?? 0
    }
}
