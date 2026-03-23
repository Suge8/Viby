import type { SyncEvent } from '@viby/protocol/types'

export type SyncEventListener = (event: SyncEvent) => void
export type SyncEventBroadcaster = {
    broadcast: (event: SyncEvent) => void
}

export class EventPublisher {
    private readonly listeners: Set<SyncEventListener> = new Set()

    constructor(
        private readonly broadcaster: SyncEventBroadcaster
    ) {
    }

    subscribe(listener: SyncEventListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    emit(event: SyncEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event)
            } catch (error) {
                console.error('[SyncEngine] Listener error:', error)
            }
        }

        this.broadcaster.broadcast(event)
    }
}
