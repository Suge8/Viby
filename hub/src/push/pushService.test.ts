import { describe, expect, it, mock } from 'bun:test'
import { generateVAPIDKeys } from 'web-push'
import { PushService, isStalePushSubscriptionError } from './pushService'
import type { Store } from '../store'

type MockPushSubscription = {
    endpoint: string
    keys: {
        p256dh: string
        auth: string
    }
}

function createStore(subscriptions: Array<{ endpoint: string; p256dh: string; auth: string }>): {
    store: Store
    removedEndpoints: string[]
} {
    const removedEndpoints: string[] = []

    return {
        store: {
            push: {
                getPushSubscriptions: () => subscriptions,
                removePushSubscription: (endpoint: string) => {
                    removedEndpoints.push(endpoint)
                }
            }
        } as Store,
        removedEndpoints
    }
}

describe('PushService', () => {
    it('treats APNs VAPID key mismatch as a stale subscription', () => {
        expect(isStalePushSubscriptionError({
            statusCode: 400,
            body: '{"reason":"VapidPkHashMismatch"}'
        })).toBe(true)
    })

    it('removes stale subscriptions when APNs reports VAPID key mismatch', async () => {
        const { store, removedEndpoints } = createStore([
            {
                endpoint: 'https://web.push.apple.com/subscription-1',
                p256dh: 'p256dh-key',
                auth: 'auth-key'
            }
        ])
        const sendNotification = mock((_subscription: MockPushSubscription, _body: string) => {
            return Promise.reject({
                statusCode: 400,
                body: '{"reason":"VapidPkHashMismatch"}'
            })
        })
        const vapidKeys = generateVAPIDKeys()
        const service = new PushService(
            {
                publicKey: vapidKeys.publicKey,
                privateKey: vapidKeys.privateKey
            },
            'mailto:test@example.com',
            store,
            sendNotification
        )

        await service.send({
            title: 'Ready for input',
            body: 'session body'
        })

        expect(sendNotification).toHaveBeenCalledTimes(1)
        expect(removedEndpoints).toEqual(['https://web.push.apple.com/subscription-1'])
    })

    it('skips excluded endpoints so other devices can still receive the same notification', async () => {
        const { store, removedEndpoints } = createStore([
            {
                endpoint: 'https://web.push.apple.com/device-a',
                p256dh: 'p256dh-a',
                auth: 'auth-a'
            },
            {
                endpoint: 'https://web.push.apple.com/device-b',
                p256dh: 'p256dh-b',
                auth: 'auth-b'
            }
        ])
        const sendNotification = mock((_subscription: MockPushSubscription, _body: string) => Promise.resolve(undefined))
        const vapidKeys = generateVAPIDKeys()
        const service = new PushService(
            {
                publicKey: vapidKeys.publicKey,
                privateKey: vapidKeys.privateKey
            },
            'mailto:test@example.com',
            store,
            sendNotification
        )

        await service.send({
            title: 'Ready for input',
            body: 'session body'
        }, {
            excludeEndpoints: ['https://web.push.apple.com/device-a']
        })

        expect(sendNotification).toHaveBeenCalledTimes(1)
        expect(sendNotification.mock.calls[0]?.[0]).toEqual({
            endpoint: 'https://web.push.apple.com/device-b',
            keys: {
                p256dh: 'p256dh-b',
                auth: 'auth-b'
            }
        })
        expect(removedEndpoints).toEqual([])
    })
})
