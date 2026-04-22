import type { SessionStreamState, SyncEvent } from '@viby/protocol/types'

type SessionStreamManagerUpdate =
    | {
          kind: 'append'
          assistantTurnId: string
          delta: string
      }
    | {
          kind: 'clear'
          assistantTurnId?: string
      }

function createStreamState(assistantTurnId: string, delta: string, now: number): SessionStreamState {
    return {
        assistantTurnId,
        startedAt: now,
        updatedAt: now,
        text: delta,
    }
}

export class SessionStreamManager {
    private readonly streams = new Map<string, SessionStreamState>()

    applyUpdate(sessionId: string, update: SessionStreamManagerUpdate): SyncEvent | null {
        if (update.kind === 'clear') {
            return this.clear(sessionId, update.assistantTurnId)
        }

        const now = Date.now()
        const current = this.streams.get(sessionId)
        const next =
            current && current.assistantTurnId === update.assistantTurnId
                ? {
                      ...current,
                      text: current.text + update.delta,
                      updatedAt: now,
                  }
                : createStreamState(update.assistantTurnId, update.delta, now)

        this.streams.set(sessionId, next)
        return {
            type: 'session-stream-updated',
            sessionId,
            stream: next,
        }
    }

    clear(sessionId: string, assistantTurnId?: string): SyncEvent | null {
        const current = this.streams.get(sessionId)
        if (!current) {
            return null
        }
        if (assistantTurnId && current.assistantTurnId !== assistantTurnId) {
            return null
        }

        this.streams.delete(sessionId)
        return {
            type: 'session-stream-cleared',
            sessionId,
            ...(assistantTurnId ? { assistantTurnId } : {}),
        }
    }

    drop(sessionId: string, assistantTurnId?: string): boolean {
        const current = this.streams.get(sessionId)
        if (!current) {
            return false
        }
        if (assistantTurnId && current.assistantTurnId !== assistantTurnId) {
            return false
        }

        this.streams.delete(sessionId)
        return true
    }

    getStream(sessionId: string): SessionStreamState | null {
        return this.streams.get(sessionId) ?? null
    }
}
