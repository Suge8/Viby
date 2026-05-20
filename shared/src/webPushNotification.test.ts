import { describe, expect, it } from 'bun:test'
import { buildWebPushNotificationDisplay } from './webPushNotification'

describe('webPushNotification', () => {
    it('builds the default visible PWA notification display options', () => {
        expect(
            buildWebPushNotificationDisplay({
                title: 'Ready for input',
                body: 'Codex is waiting in Mobile E2E',
                tag: 'ready-session-1',
                data: {
                    type: 'ready',
                    sessionId: 'session-1',
                    url: '/sessions/session-1',
                },
            })
        ).toEqual({
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
    })
})
