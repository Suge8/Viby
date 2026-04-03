import { createEmptySessionMessageActivity, mergeSessionMessageActivity, type SessionMessageActivity } from '@viby/protocol'
import { describe, expect, it } from 'bun:test'
import type { Session, SyncEvent, SyncEventListener, SyncEngine } from '../sync/syncEngine'
import type { NotificationChannel } from './notificationTypes'
import { NotificationHub } from './notificationHub'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

class FakeSyncEngine {
    private readonly listeners: Set<SyncEventListener> = new Set()
    private readonly sessions: Map<string, Session> = new Map()
    private readonly messageActivities: Map<string, SessionMessageActivity> = new Map()

    subscribe(listener: SyncEventListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    getSession(sessionId: string): Session | undefined {
        return this.sessions.get(sessionId)
    }

    setSession(session: Session): void {
        this.sessions.set(session.id, session)
    }

    getSessionMessageActivities(sessionIds: string[]): Record<string, SessionMessageActivity> {
        return Object.fromEntries(sessionIds.map((sessionId) => [
            sessionId,
            this.messageActivities.get(sessionId) ?? createEmptySessionMessageActivity()
        ]))
    }

    emit(event: SyncEvent): void {
        if (event.type === 'message-received' && event.sessionId) {
            const current = this.messageActivities.get(event.sessionId) ?? createEmptySessionMessageActivity()
            this.messageActivities.set(event.sessionId, mergeSessionMessageActivity(current, event.message))
        }

        for (const listener of this.listeners) {
            listener(event)
        }
    }
}

class StubChannel implements NotificationChannel {
    readonly readySessions: Session[] = []
    readonly permissionSessions: Session[] = []

    async sendReady(session: Session): Promise<void> {
        this.readySessions.push(session)
    }

    async sendPermissionRequest(session: Session): Promise<void> {
        this.permissionSessions.push(session)
    }
}

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 0,
        updatedAt: 0,
        active: true,
        activeAt: 0,
        metadata: null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        model: null,
        modelReasoningEffort: null,
        ...overrides
    }
}

describe('NotificationHub', () => {
    it('debounces permission notifications and triggers when request IDs change', async () => {
        const engine = new FakeSyncEngine()
        const channel = new StubChannel()
        const hub = new NotificationHub(engine as unknown as SyncEngine, [channel], {
            permissionDebounceMs: 5,
            readyCooldownMs: 5
        })

        const firstSession = createSession({
            agentState: {
                requests: {
                    req1: { tool: 'Edit', arguments: {}, createdAt: 1 }
                }
            }
        })

        engine.setSession(firstSession)
        engine.emit({ type: 'session-updated', sessionId: firstSession.id })
        await sleep(25)

        expect(channel.permissionSessions).toHaveLength(1)

        engine.emit({ type: 'session-updated', sessionId: firstSession.id })
        await sleep(25)

        expect(channel.permissionSessions).toHaveLength(1)

        const secondSession = createSession({
            id: firstSession.id,
            agentState: {
                requests: {
                    req2: { tool: 'Read', arguments: {}, createdAt: 2 }
                }
            }
        })

        engine.setSession(secondSession)
        engine.emit({ type: 'session-updated', sessionId: secondSession.id })
        await sleep(25)

        expect(channel.permissionSessions).toHaveLength(2)

        hub.stop()
    })

    it('sends ready notifications only after the session reaches the shared ready-for-input state', async () => {
        const engine = new FakeSyncEngine()
        const channel = new StubChannel()
        const hub = new NotificationHub(engine as unknown as SyncEngine, [channel], {
            permissionDebounceMs: 1,
            readyCooldownMs: 20
        })

        const session = createSession({ thinking: true })
        engine.setSession(session)

        const readyEvent: SyncEvent = {
            type: 'message-received',
            sessionId: session.id,
            message: {
                id: 'message-1',
                seq: 1,
                localId: null,
                createdAt: 1,
                content: {
                    role: 'agent',
                    content: {
                        id: 'event-1',
                        type: 'event',
                        data: { type: 'ready' }
                    }
                }
            }
        }

        engine.emit(readyEvent)
        await sleep(25)
        expect(channel.readySessions).toHaveLength(0)

        engine.setSession({ ...session, thinking: false })
        engine.emit({ type: 'session-updated', sessionId: session.id })
        await sleep(25)
        expect(channel.readySessions).toHaveLength(1)

        engine.emit({ type: 'session-updated', sessionId: session.id })
        await sleep(25)
        expect(channel.readySessions).toHaveLength(1)

        await sleep(30)
        engine.setSession({ ...session, thinking: true })
        engine.emit({ type: 'session-updated', sessionId: session.id })
        engine.setSession({ ...session, thinking: false })
        engine.emit({ type: 'session-updated', sessionId: session.id })
        await sleep(25)
        expect(channel.readySessions).toHaveLength(2)

        hub.stop()
    })
})
