import type { SessionStreamState, SyncEvent } from '@viby/protocol/types'

type SessionStreamManagerUpdate =
    | {
        kind: 'append'
        streamId: string
        delta: string
    }
    | {
        kind: 'clear'
        streamId?: string
    }

function createStreamState(streamId: string, delta: string, now: number): SessionStreamState {
    return {
        streamId,
        startedAt: now,
        updatedAt: now,
        text: delta
    }
}

export class SessionStreamManager {
    private readonly streams = new Map<string, SessionStreamState>()

    applyUpdate(sessionId: string, update: SessionStreamManagerUpdate): SyncEvent | null {
        if (update.kind === 'clear') {
            return this.clear(sessionId, update.streamId)
        }

        const now = Date.now()
        const current = this.streams.get(sessionId)
        const next = current && current.streamId === update.streamId
            ? {
                ...current,
                text: current.text + update.delta,
                updatedAt: now
            }
            : createStreamState(update.streamId, update.delta, now)

        this.streams.set(sessionId, next)
        return {
            type: 'session-stream-updated',
            sessionId,
            stream: next
        }
    }

    clear(sessionId: string, streamId?: string): SyncEvent | null {
        const current = this.streams.get(sessionId)
        if (!current) {
            return null
        }
        if (streamId && current.streamId !== streamId) {
            return null
        }

        this.streams.delete(sessionId)
        return {
            type: 'session-stream-cleared',
            sessionId,
            ...(streamId ? { streamId } : {})
        }
    }

    drop(sessionId: string, streamId?: string): boolean {
        const current = this.streams.get(sessionId)
        if (!current) {
            return false
        }
        if (streamId && current.streamId !== streamId) {
            return false
        }

        this.streams.delete(sessionId)
        return true
    }

    getStream(sessionId: string): SessionStreamState | null {
        return this.streams.get(sessionId) ?? null
    }
}
