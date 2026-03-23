import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const workboxMocks = vi.hoisted(() => ({
    precacheAndRoute: vi.fn(),
    cleanupOutdatedCaches: vi.fn(),
    registerRoute: vi.fn(),
    CacheFirst: vi.fn(function CacheFirst(this: Record<string, unknown>, options: unknown) {
        this.type = 'cache-first'
        this.options = options
    }),
    NetworkFirst: vi.fn(function NetworkFirst(this: Record<string, unknown>, options: unknown) {
        this.type = 'network-first'
        this.options = options
    }),
    ExpirationPlugin: vi.fn(function ExpirationPlugin(this: Record<string, unknown>, options: unknown) {
        this.type = 'expiration-plugin'
        this.options = options
    }),
}))

vi.mock('workbox-precaching', () => ({
    precacheAndRoute: workboxMocks.precacheAndRoute,
    cleanupOutdatedCaches: workboxMocks.cleanupOutdatedCaches,
}))

vi.mock('workbox-routing', () => ({
    registerRoute: workboxMocks.registerRoute,
}))

vi.mock('workbox-strategies', () => ({
    CacheFirst: workboxMocks.CacheFirst,
    NetworkFirst: workboxMocks.NetworkFirst,
}))

vi.mock('workbox-expiration', () => ({
    ExpirationPlugin: workboxMocks.ExpirationPlugin,
}))

type ServiceWorkerListenerMap = Partial<Record<'activate' | 'push' | 'notificationclick', (event: any) => void>>

type MockWindowClient = {
    url: string
    focus?: ReturnType<typeof vi.fn<() => Promise<void>>>
    navigate?: ReturnType<typeof vi.fn<(url: string) => Promise<void>>>
}

function createWaitUntilEvent<T extends object>(event: T): T & {
    waitUntil: ReturnType<typeof vi.fn<(promise: Promise<unknown>) => void>>
    __waitUntilPromise: Promise<unknown> | null
} {
    let waitUntilPromise: Promise<unknown> | null = null

    return {
        ...event,
        waitUntil: vi.fn((promise: Promise<unknown>) => {
            waitUntilPromise = promise
        }),
        get __waitUntilPromise() {
            return waitUntilPromise
        }
    }
}

describe('service worker push notifications', () => {
    const originalSelf = globalThis.self
    let listeners: ServiceWorkerListenerMap
    let matchAllMock: ReturnType<typeof vi.fn<() => Promise<MockWindowClient[]>>>
    let openWindowMock: ReturnType<typeof vi.fn<(url: string) => Promise<void>>>
    let showNotificationMock: ReturnType<typeof vi.fn<(title: string, options: NotificationOptions) => Promise<void>>>

    async function loadServiceWorker() {
        vi.resetModules()
        await import('./sw')
    }

    beforeEach(() => {
        listeners = {}
        matchAllMock = vi.fn<() => Promise<MockWindowClient[]>>().mockResolvedValue([])
        openWindowMock = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined)
        showNotificationMock = vi.fn<(title: string, options: NotificationOptions) => Promise<void>>().mockResolvedValue(undefined)

        Object.defineProperty(globalThis, 'self', {
            configurable: true,
            value: {
                __WB_MANIFEST: [],
                location: {
                    origin: 'https://app.viby.run'
                },
                registration: {
                    showNotification: showNotificationMock
                },
                clients: {
                    claim: vi.fn().mockResolvedValue(undefined),
                    matchAll: matchAllMock,
                    openWindow: openWindowMock
                },
                skipWaiting: vi.fn(),
                addEventListener: vi.fn((type: keyof ServiceWorkerListenerMap, handler: (event: any) => void) => {
                    listeners[type] = handler
                })
            }
        })
    })

    afterEach(() => {
        vi.clearAllMocks()
        Object.defineProperty(globalThis, 'self', {
            configurable: true,
            value: originalSelf
        })
    })

    it('shows push notifications with the expected default assets', async () => {
        await loadServiceWorker()

        const pushEvent = createWaitUntilEvent({
            data: {
                json: () => ({
                    title: 'Viby',
                    body: 'Agent is ready',
                    data: {
                        url: '/sessions/session-1'
                    }
                })
            }
        })

        listeners.push?.(pushEvent)
        await pushEvent.__waitUntilPromise

        expect(showNotificationMock).toHaveBeenCalledWith('Viby', {
            body: 'Agent is ready',
            icon: '/pwa-192x192.png',
            badge: '/pwa-64x64.png',
            data: {
                url: '/sessions/session-1'
            },
            tag: undefined
        })
    })

    it('focuses an already opened target window instead of opening a new one', async () => {
        const focusMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
        matchAllMock.mockResolvedValue([
            {
                url: 'https://app.viby.run/sessions/session-1',
                focus: focusMock
            }
        ])

        await loadServiceWorker()

        const notificationClickEvent = createWaitUntilEvent({
            notification: {
                close: vi.fn(),
                data: {
                    url: '/sessions/session-1'
                }
            }
        })

        listeners.notificationclick?.(notificationClickEvent)
        await notificationClickEvent.__waitUntilPromise

        expect(notificationClickEvent.notification.close).toHaveBeenCalledTimes(1)
        expect(focusMock).toHaveBeenCalledTimes(1)
        expect(openWindowMock).not.toHaveBeenCalled()
    })

    it('navigates and focuses an existing same-origin window before falling back to openWindow', async () => {
        const focusMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const navigateMock = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined)
        matchAllMock.mockResolvedValue([
            {
                url: 'https://app.viby.run/sessions/other-session',
                focus: focusMock,
                navigate: navigateMock
            }
        ])

        await loadServiceWorker()

        const notificationClickEvent = createWaitUntilEvent({
            notification: {
                close: vi.fn(),
                data: {
                    url: '/sessions/session-1'
                }
            }
        })

        listeners.notificationclick?.(notificationClickEvent)
        await notificationClickEvent.__waitUntilPromise

        expect(navigateMock).toHaveBeenCalledWith('https://app.viby.run/sessions/session-1')
        expect(focusMock).toHaveBeenCalledTimes(1)
        expect(openWindowMock).not.toHaveBeenCalled()
    })

    it('opens a new window when no same-origin client is available', async () => {
        matchAllMock.mockResolvedValue([
            {
                url: 'https://another-origin.example/sessions/session-1',
                focus: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
            }
        ])

        await loadServiceWorker()

        const notificationClickEvent = createWaitUntilEvent({
            notification: {
                close: vi.fn(),
                data: {
                    url: '/sessions/session-1'
                }
            }
        })

        listeners.notificationclick?.(notificationClickEvent)
        await notificationClickEvent.__waitUntilPromise

        expect(openWindowMock).toHaveBeenCalledWith('/sessions/session-1')
    })
})
