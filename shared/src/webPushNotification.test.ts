import { describe, expect, it } from 'bun:test'
import { buildWebPushNotificationDisplay } from './webPushNotification'

describe('webPushNotification', () => {
    it('builds the default visible PWA notification display options', () => {
        expect(
            buildWebPushNotificationDisplay({
                title: 'Test notification',
                body: 'Test body',
                tag: 'test-session-1',
                data: {
                    type: 'test',
                    sessionId: 'session-1',
                    url: '/sessions/session-1',
                },
            })
        ).toEqual({
            title: 'Test notification',
            options: {
                body: 'Test body',
                icon: '/pwa-192x192.png',
                badge: '/pwa-64x64.png',
                data: {
                    type: 'test',
                    sessionId: 'session-1',
                    url: '/sessions/session-1',
                },
                tag: 'test-session-1',
            },
        })
    })
})
