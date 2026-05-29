import { describe, expect, it, mock } from 'bun:test'
import {
    buildWebPushNotificationDisplay,
    createEmptySessionMessageActivity,
    mergeSessionMessageActivity,
} from '@viby/protocol'
import type { SessionMessageActivity } from '@viby/protocol/types'
import { PushNotificationChannel } from '../push/pushNotificationChannel'
import type { PushPayload } from '../push/pushService'
import type { Session, SyncEngine, SyncEvent, SyncEventListener } from '../sync/syncEngine'
import { NotificationHub } from './notificationHub'

class FakeSyncEngine {
    private readonly listeners = new Set<SyncEventListener>()
    private readonly sessions = new Map<string, Session>()
    private readonly messageActivities = new Map<string, SessionMessageActivity>()

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
        return Object.fromEntries(
            sessionIds.map((sessionId) => [
                sessionId,
                this.messageActivities.get(sessionId) ?? createEmptySessionMessageActivity(),
            ])
        )
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

function createReplyEvent(sessionId: string): SyncEvent {
    return {
        type: 'message-received',
        sessionId,
        message: {
            id: 'message-reply',
            seq: 1,
            localId: null,
            createdAt: 1,
            content: {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'message',
                        message: 'Done',
                    },
                },
            },
        },
    }
}

function createReadyEvent(sessionId: string): SyncEvent {
    return {
        type: 'message-received',
        sessionId,
        message: {
            id: 'message-ready',
            seq: 2,
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
            new PushNotificationChannel(pushService as never, realtime as never),
        ])

        const session = createSession({ thinking: true })
        engine.setSession(session)
        engine.emit(createReplyEvent(session.id))
        engine.emit(createReadyEvent(session.id))
        await nextMicrotask()
        expect(pushService.send).not.toHaveBeenCalled()

        engine.setSession({ ...session, thinking: false })
        engine.emit({ type: 'session-updated', sessionId: session.id })
        await nextMicrotask()

        expect(pushService.send).toHaveBeenCalledWith(
            {
                title: '回复完成',
                body: '会话：Mobile E2E',
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
            title: '回复完成',
            options: {
                body: '会话：Mobile E2E',
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

    it('turns a pending permission request into the shared PWA notification copy', async () => {
        const pushService = { send: mock(async () => {}) }
        const realtime = { sendToast: mock(async () => ['endpoint-1']) }
        const channel = new PushNotificationChannel(pushService as never, realtime as never)
        const session = createSession({
            agentState: {
                requests: {
                    request1: { tool: 'Bash', arguments: {}, createdAt: 1 },
                },
            },
        })

        await channel.sendPermissionRequest(session)

        expect(realtime.sendToast).toHaveBeenCalledWith({
            type: 'toast',
            data: {
                title: '待审核',
                body: '会话：Mobile E2E',
                sessionId: 'session-1',
                url: '/sessions/session-1',
                tone: 'warning',
                kind: 'permission-request',
                sessionName: 'Mobile E2E',
                toolName: 'Bash',
            },
        })
        expect(pushService.send).toHaveBeenCalledWith(
            {
                title: '待审核',
                body: '会话：Mobile E2E · Bash',
                tag: 'permission-session-1',
                data: {
                    type: 'permission-request',
                    sessionId: 'session-1',
                    url: '/sessions/session-1',
                },
            },
            { excludeEndpoints: ['endpoint-1'] }
        )
    })
})
