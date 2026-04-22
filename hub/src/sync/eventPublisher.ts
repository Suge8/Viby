import type { SyncEvent } from '@viby/protocol/types'
import { reportHubRuntimeError } from '../runtime/runtimeDiagnostics'

export type SyncEventListener = (event: SyncEvent) => void
export type SyncEventBroadcaster = {
    broadcast: (event: SyncEvent) => void
}

export class EventPublisher {
    private readonly listeners: Set<SyncEventListener> = new Set()

    constructor(private readonly broadcaster: SyncEventBroadcaster) {}

    subscribe(listener: SyncEventListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    emit(event: SyncEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event)
            } catch (error) {
                reportHubRuntimeError('Sync listener threw unexpectedly.', error)
            }
        }

        this.broadcaster.broadcast(event)
    }
}
