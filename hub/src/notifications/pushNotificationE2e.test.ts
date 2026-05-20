import { describe, expect, it, mock } from 'bun:test'
import { buildWebPushNotificationDisplay } from '@viby/protocol'
import { PushNotificationChannel } from '../push/pushNotificationChannel'
import type { PushPayload } from '../push/pushService'
import type { Session, SyncEngine, SyncEvent, SyncEventListener } from '../sync/syncEngine'
import { NotificationHub } from './notificationHub'

class FakeSyncEngine {
    private readonly listeners = new Set<SyncEventListener>()
    private readonly sessions = new Map<string, Session>()

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

    emit(event: SyncEvent): void {
        for (const listener of this.listeners) {
            listener(event)
        }
    }
}

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            path: '/workspace/mobile-e2e',
            host: 'mac',
            name: 'Mobile E2E',
            driver: 'codex',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        model: null,
        modelReasoningEffort: null,
        codexServiceTier: null,
        ...overrides,
    }
}

function createReadyEvent(sessionId: string): SyncEvent {
    return {
        type: 'message-received',
        sessionId,
        message: {
            id: 'message-ready',
            seq: 1,
            localId: null,
            createdAt: 2,
            content: {
                role: 'agent',
                content: {
                    id: 'event-ready',
                    type: 'event',
                    data: { type: 'ready' },
                },
            },
        },
    }
}

function nextMicrotask(): Promise<void> {
    return Promise.resolve()
}

describe('push notification end-to-end', () => {
    it('turns a completed AI turn into the PWA system notification display payload', async () => {
        let sentPayload: PushPayload | null = null
        const engine = new FakeSyncEngine()
        const pushService = {
            send: mock(async (payload: PushPayload) => {
                sentPayload = payload
            }),
        }
        const realtime = {
            sendToast: mock(async () => [] as string[]),
        }
        const hub = new NotificationHub(engine as unknown as SyncEngine, [
            new PushNotificationChannel(pushService as never, realtime as never, 'https://pair.viby.run'),
        ])

        const session = createSession({ thinking: true })
        engine.setSession(session)
        engine.emit(createReadyEvent(session.id))
        await nextMicrotask()
        expect(pushService.send).not.toHaveBeenCalled()

        engine.setSession({ ...session, thinking: false })
        engine.emit({ type: 'session-updated', sessionId: session.id })
        await nextMicrotask()

        expect(pushService.send).toHaveBeenCalledWith(
            {
                title: 'Ready for input',
                body: 'Codex is waiting in Mobile E2E',
                tag: 'ready-session-1',
                data: {
                    type: 'ready',
                    sessionId: 'session-1',
                    url: '/sessions/session-1',
                },
            },
            { excludeEndpoints: [] }
        )
        if (!sentPayload) {
            throw new Error('Ready notification did not send a push payload')
        }

        expect(buildWebPushNotificationDisplay(sentPayload)).toEqual({
            title: 'Ready for input',
            options: {
                body: 'Codex is waiting in Mobile E2E',
                icon: '/pwa-192x192.png',
                badge: '/pwa-64x64.png',
                data: {
                    type: 'ready',
                    sessionId: 'session-1',
                    url: '/sessions/session-1',
                },
                tag: 'ready-session-1',
            },
        })

        hub.stop()
    })
})
