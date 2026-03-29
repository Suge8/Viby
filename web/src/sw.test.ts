import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    buildAppShellPrecacheManifest,
    isNonCriticalPrecacheAssetUrl
} from '@/lib/swPrecacheManifest'

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

    it('keeps non-critical optional chunks out of the app-shell precache manifest', async () => {
        expect(buildAppShellPrecacheManifest([
            '/assets/index-main.js',
            '/assets/SessionsShell-zzz000.js',
            '/assets/chat-aaa111.js',
            '/assets/SessionChatWorkspace-bbb222.js',
            '/assets/sessionDetailPreload-ccc333.js',
            '/assets/sessionDetailRoutePreload-lll999.js',
            '/assets/terminal-ddd444.js',
            '/assets/files-eee555.js',
            '/assets/DirectoryTree-ffg111.js',
            '/assets/file-fff666.js',
            '/assets/fileContentView-ffh222.js',
            '/assets/new-ggg777.js',
            '/assets/settings-hhh888.js',
            '/assets/vendor-terminal-abc123.js',
            '/assets/vendor-syntax-def456.js',
            '/assets/markdown-text-ghi789.js',
            '/assets/MarkdownPrimitive-jkl345.js',
            '/assets/markdownConfig-klm456.js',
            '/assets/ShikiCodeContent-qwe987.js',
            '/assets/FloatingActionMenu-pqr678.js',
            '/assets/FloatingActionMenu.contract-rst789.js',
            '/assets/registerRuntimeServiceWorker-stu890.js',
            '/assets/workbox-window.prod.es5-tuv901.js',
            '/assets/usePWAInstall-uvw012.js',
            '/assets/SessionAutocompleteSkills-qrs789.js',
            '/assets/SessionAutocompleteSlashCommands-tuv012.js',
            '/assets/recent-skills-uvw345.js',
            '/assets/sessionAutocompleteQuery-xyz678.js',
            '/assets/SessionHeaderActionMenu-stu901.js',
            '/assets/SessionListActionController-vwx234.js',
            '/assets/ProjectPanel-ghi012.js',
            '/assets/MemberControlBanner-hij123.js',
            '/assets/VibyThread-jkl345.js',
            '/assets/VibyComposer-mno678.js',
            '/assets/ComposerDraftController-pqr901.js',
            '/assets/ComposerControlsOverlay-cde234.js',
            '/assets/useActiveSuggestions-def345.js',
            '/assets/RichAssistantTextMessageContent-efg456.js',
            '/assets/RichAssistantToolMessageContent-fgh567.js',
            '/assets/CliOutputBlock-ghi678.js',
            '/assets/reasoning-hij789.js',
            '/assets/clientAutocomplete-bbb111.js',
            '/assets/clientMachines-ccc222.js',
            '/assets/clientPush-ddd333.js',
            '/assets/clientWorkspace-eee444.js',
            '/assets/featureIcons-aaa111.js',
            '/assets/message-window-store-fff666.js',
            '/assets/messageWindowStoreCore-ggg111.js',
            '/assets/messageWindowStoreAsync-hhh222.js',
            '/assets/modes-ggg777.js',
            '/assets/reducerCliOutput-hhh888.js',
            '/assets/sessionQueryCache-iii999.js',
            '/assets/TerminalView-jjj000.js',
            '/assets/filesPageViews-kkk111.js',
            '/assets/MarkdownRenderer-lll222.js',
            '/assets/_all-mmm333.js',
            '/assets/_results-nnn444.js',
            '/assets/zh-CN-fff555.js',
            '/assets/typescript-mno345.js',
            '/assets/index-main.css'
        ])).toEqual([
            '/assets/index-main.js',
            '/assets/index-main.css'
        ])
    })

    it('matches optional runtime asset urls using the shared chunk markers', () => {
        expect(isNonCriticalPrecacheAssetUrl('/assets/SessionsShell-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/chat-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/SessionChatWorkspace-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/sessionDetailPreload-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/sessionDetailRoutePreload-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/terminal-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/files-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/DirectoryTree-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/file-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/fileContentView-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/new-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/settings-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/vendor-terminal-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/markdown-text-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/MarkdownPrimitive-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/markdownConfig-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/ShikiCodeContent-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/FloatingActionMenu-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/FloatingActionMenu.contract-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/registerRuntimeServiceWorker-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/workbox-window.prod.es5-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/usePWAInstall-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/SessionAutocompleteSkills-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/SessionAutocompleteSlashCommands-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/recent-skills-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/sessionAutocompleteQuery-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/SessionHeaderActionMenu-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/ProjectPanel-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/MemberControlBanner-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/VibyThread-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/VibyComposer-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/ComposerDraftController-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/ComposerControlsOverlay-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/useActiveSuggestions-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/RichAssistantTextMessageContent-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/RichAssistantToolMessageContent-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/CliOutputBlock-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/reasoning-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/clientAutocomplete-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/clientMachines-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/clientPush-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/clientWorkspace-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/featureIcons-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/message-window-store-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/messageWindowStoreCore-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/messageWindowStoreAsync-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/modes-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/reducerCliOutput-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/sessionQueryCache-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/TerminalView-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/filesPageViews-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/MarkdownRenderer-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/_all-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/_results-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/zh-CN-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/typescript-abc123.js')).toBe(true)
        expect(isNonCriticalPrecacheAssetUrl('/assets/index-main.js')).toBe(false)
    })

    it('registers a cache-first runtime route for optional same-origin assets', async () => {
        await loadServiceWorker()

        const optionalAssetRouteCall = workboxMocks.registerRoute.mock.calls.find((call) => {
            if (typeof call[0] !== 'function') {
                return false
            }
            const matcher = call[0] as ({ request, url }: { request: Request; url: URL }) => boolean
            return matcher({
                request: { destination: 'script' } as Request,
                url: new URL('https://app.viby.run/assets/MarkdownPrimitive-abc123.js')
            })
        })

        expect(optionalAssetRouteCall).toBeTruthy()

        const matcher = optionalAssetRouteCall?.[0] as ({ request, url }: { request: Request; url: URL }) => boolean
        expect(matcher({
            request: { destination: 'script' } as Request,
            url: new URL('https://app.viby.run/assets/ShikiCodeContent-abc123.js')
        })).toBe(true)
        expect(matcher({
            request: { destination: 'style' } as Request,
            url: new URL('https://app.viby.run/assets/vendor-terminal-abc123.css')
        })).toBe(true)
        expect(matcher({
            request: { destination: 'script' } as Request,
            url: new URL('https://app.viby.run/assets/index-main.js')
        })).toBe(false)
        expect(matcher({
            request: { destination: 'script' } as Request,
            url: new URL('https://cdn.example.com/assets/ShikiCodeContent-abc123.js')
        })).toBe(false)

        const strategy = optionalAssetRouteCall?.[1] as { options?: { plugins?: Array<{ type?: string; options?: { statuses?: number[] } }> } }
        expect(strategy.options?.plugins).toEqual([
            expect.objectContaining({
                name: 'cacheable-response-plugin'
            }),
            expect.objectContaining({
                type: 'expiration-plugin'
            })
        ])

        const cacheablePlugin = strategy.options?.plugins?.[0] as { cacheWillUpdate: (options: { response: Response }) => Promise<Response | null> }
        await expect(cacheablePlugin.cacheWillUpdate({ response: new Response('ok', { status: 200 }) })).resolves.toBeInstanceOf(Response)
        await expect(cacheablePlugin.cacheWillUpdate({ response: new Response('missing', { status: 404 }) })).resolves.toBeNull()
    })

    it('only caches successful same-origin API responses in network-first routes', async () => {
        await loadServiceWorker()

        const apiRouteCall = workboxMocks.registerRoute.mock.calls.find((call) => {
            if (typeof call[0] !== 'function') {
                return false
            }
            const matcher = call[0] as ({ url }: { url: URL }) => boolean
            return matcher({
                url: new URL('https://app.viby.run/api/sessions')
            })
        })

        const strategy = apiRouteCall?.[1] as { options?: { plugins?: Array<{ type?: string; options?: { statuses?: number[] } }> } }
        expect(strategy.options?.plugins).toEqual([
            expect.objectContaining({
                name: 'cacheable-response-plugin'
            }),
            expect.objectContaining({
                type: 'expiration-plugin'
            })
        ])

        const cacheablePlugin = strategy.options?.plugins?.[0] as { cacheWillUpdate: (options: { response: Response }) => Promise<Response | null> }
        await expect(cacheablePlugin.cacheWillUpdate({ response: new Response('{}', { status: 200 }) })).resolves.toBeInstanceOf(Response)
        await expect(cacheablePlugin.cacheWillUpdate({ response: new Response('{}', { status: 500 }) })).resolves.toBeNull()
    })

    it('allows opaque CDN responses for socket.io runtime caching', async () => {
        await loadServiceWorker()

        const cdnRouteCall = workboxMocks.registerRoute.mock.calls.find((call) => call[0] instanceof RegExp)
        const strategy = cdnRouteCall?.[1] as { options?: { plugins?: Array<{ type?: string; options?: { statuses?: number[] } }> } }

        expect(strategy.options?.plugins).toEqual([
            expect.objectContaining({
                name: 'cacheable-response-plugin'
            }),
            expect.objectContaining({
                type: 'expiration-plugin'
            })
        ])

        const cacheablePlugin = strategy.options?.plugins?.[0] as { cacheWillUpdate: (options: { response: Response }) => Promise<Response | null> }
        await expect(cacheablePlugin.cacheWillUpdate({ response: new Response('', { status: 200 }) })).resolves.toBeInstanceOf(Response)
        await expect(cacheablePlugin.cacheWillUpdate({ response: { status: 0 } as Response })).resolves.toEqual({ status: 0 })
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
