import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePushNotifications } from './usePushNotifications'

const shouldRegisterServiceWorkerForOriginMock = vi.fn<(origin: string) => boolean>()

vi.mock('@/lib/runtimeAssetPolicy', () => ({
    shouldRegisterServiceWorkerForOrigin: (origin: string) => shouldRegisterServiceWorkerForOriginMock(origin)
}))

type MockNotification = {
    permission: NotificationPermission
    requestPermission: ReturnType<typeof vi.fn<() => Promise<NotificationPermission>>>
}

type MockPushSubscription = PushSubscription & {
    unsubscribe: ReturnType<typeof vi.fn<() => Promise<boolean>>>
    toJSON: ReturnType<typeof vi.fn<() => PushSubscriptionJSON>>
}

function createApplicationServerKey(seed: number): Uint8Array {
    return Uint8Array.from({ length: 65 }, (_, index) => (seed + index) % 255)
}

function installNotificationMock(permission: NotificationPermission): MockNotification {
    const notification = {
        permission,
        requestPermission: vi.fn<() => Promise<NotificationPermission>>().mockResolvedValue(permission)
    }
    Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: notification
    })
    return notification
}

function installPushSupport(pushManager: {
    getSubscription: ReturnType<typeof vi.fn<() => Promise<PushSubscription | null>>>
    subscribe: ReturnType<typeof vi.fn<() => Promise<PushSubscription>>>
}): void {
    Object.defineProperty(window, 'PushManager', {
        configurable: true,
        value: class PushManagerMock {}
    })
    Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
            getRegistration: vi.fn<() => Promise<ServiceWorkerRegistration>>().mockResolvedValue({
                pushManager: {
                    ...pushManager,
                    permissionState: vi.fn(),
                }
            } as unknown as ServiceWorkerRegistration)
        }
    })
}

function createSubscription(options: {
    endpoint: string
    applicationServerKey: Uint8Array
}): MockPushSubscription {
    return {
        endpoint: options.endpoint,
        expirationTime: null,
        getKey: vi.fn(),
        unsubscribe: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
        toJSON: vi.fn(() => ({
            endpoint: options.endpoint,
            keys: {
                p256dh: 'p256dh-key',
                auth: 'auth-key'
            }
        })),
        options: {
            applicationServerKey: options.applicationServerKey.buffer
        }
    } as unknown as MockPushSubscription
}

describe('usePushNotifications', () => {
    const originalNotification = window.Notification
    const originalPushManager = (window as Window & { PushManager?: unknown }).PushManager
    const originalServiceWorker = (navigator as Navigator & { serviceWorker?: unknown }).serviceWorker

    beforeEach(() => {
        vi.restoreAllMocks()
        shouldRegisterServiceWorkerForOriginMock.mockReturnValue(true)
    })

    afterEach(() => {
        Object.defineProperty(window, 'Notification', {
            configurable: true,
            value: originalNotification
        })
        if (originalPushManager === undefined) {
            Object.defineProperty(window, 'PushManager', {
                configurable: true,
                value: undefined
            })
        } else {
            Object.defineProperty(window, 'PushManager', {
                configurable: true,
                value: originalPushManager
            })
        }
        if (originalServiceWorker === undefined) {
            Object.defineProperty(navigator, 'serviceWorker', {
                configurable: true,
                value: undefined
            })
        } else {
            Object.defineProperty(navigator, 'serviceWorker', {
                configurable: true,
                value: originalServiceWorker
            })
        }
    })

    it('re-subscribes when the existing subscription uses a different VAPID public key', async () => {
        installNotificationMock('granted')
        const staleSubscription = createSubscription({
            endpoint: 'https://push.example.com/stale',
            applicationServerKey: createApplicationServerKey(1)
        })
        const freshSubscription = createSubscription({
            endpoint: 'https://push.example.com/fresh',
            applicationServerKey: createApplicationServerKey(20)
        })
        const pushManager = {
            getSubscription: vi.fn<() => Promise<PushSubscription | null>>().mockResolvedValue(staleSubscription),
            subscribe: vi.fn<() => Promise<PushSubscription>>().mockResolvedValue(freshSubscription)
        }
        installPushSupport(pushManager)

        const api = {
            getPushVapidPublicKey: vi.fn().mockResolvedValue({
                publicKey: 'FBUfQ9n3eZxM4n1l7w2W5mM8i8IHbS7R0YjNfJ0W4yC4tJmJ8x4b1zU5p7uR2oH1rQ6gC5fK0dL2nP3sA4tB5cC'
            }),
            subscribePushNotifications: vi.fn().mockResolvedValue(undefined),
            unsubscribePushNotifications: vi.fn().mockResolvedValue(undefined)
        }

        const { result } = renderHook(() => usePushNotifications(api as never))

        await waitFor(() => {
            expect(result.current.isSupported).toBe(true)
        })

        await act(async () => {
            await result.current.ensureSubscription()
        })

        expect(result.current.pushEndpoint).toBe('https://push.example.com/fresh')
        expect(staleSubscription.unsubscribe).toHaveBeenCalledTimes(1)
        expect(api.unsubscribePushNotifications).toHaveBeenCalledWith({
            endpoint: 'https://push.example.com/stale'
        })
        expect(pushManager.subscribe).toHaveBeenCalledTimes(1)
        expect(api.subscribePushNotifications).toHaveBeenCalledWith({
            endpoint: 'https://push.example.com/fresh',
            keys: {
                p256dh: 'p256dh-key',
                auth: 'auth-key'
            }
        })
    })

    it('does not expose push support on origins where service workers are intentionally disabled', async () => {
        installNotificationMock('default')
        shouldRegisterServiceWorkerForOriginMock.mockReturnValue(false)

        const { result } = renderHook(() => usePushNotifications(null))

        await waitFor(() => {
            expect(result.current.isSupported).toBe(false)
            expect(result.current.isSubscribed).toBe(false)
            expect(result.current.pushEndpoint).toBe(null)
        })

        await act(async () => {
            await expect(result.current.enableNotifications()).resolves.toBe(false)
        })
    })
})
