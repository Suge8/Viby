/// <reference lib="webworker" />

import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import {
    buildAppShellPrecacheManifest,
    isNonCriticalPrecacheAssetUrl,
    isOptionalRuntimeCacheAssetUrl,
} from '@/lib/swPrecacheManifest'

declare const self: ServiceWorkerGlobalScope & {
    __WB_MANIFEST: Array<string | { url: string; revision?: string }>
}

type PushPayload = {
    title: string
    body?: string
    icon?: string
    badge?: string
    tag?: string
    data?: {
        type?: string
        sessionId?: string
        url?: string
    }
}

const API_SESSIONS_CACHE_NAME = 'api-sessions'
const API_SESSION_DETAIL_CACHE_NAME = 'api-session-detail'
const API_RUNTIME_CACHE_NAME = 'api-runtime'
const CDN_SOCKET_IO_CACHE_NAME = 'cdn-socketio'
const OPTIONAL_ASSET_CACHE_NAME = 'optional-assets'
const API_NETWORK_TIMEOUT_SECONDS = 10
const API_SESSIONS_MAX_ENTRIES = 10
const API_SESSIONS_MAX_AGE_SECONDS = 60 * 5
const API_SESSION_DETAIL_MAX_ENTRIES = 20
const API_SESSION_DETAIL_MAX_AGE_SECONDS = 60 * 5
const API_RUNTIME_MAX_ENTRIES = 5
const API_RUNTIME_MAX_AGE_SECONDS = 60 * 10
const CDN_SOCKET_IO_MAX_ENTRIES = 5
const CDN_SOCKET_IO_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const OPTIONAL_ASSET_MAX_ENTRIES = 64
const OPTIONAL_ASSET_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const SAME_ORIGIN_CACHEABLE_RESPONSE_STATUSES = [200]
const CROSS_ORIGIN_CACHEABLE_RESPONSE_STATUSES = [0, 200]

type CacheableResponseRuntimePlugin = {
    readonly name: 'cacheable-response-plugin'
    cacheWillUpdate: (options: { response: Response }) => Promise<Response | null>
}

function isRuntimeCacheableOptionalAssetRequest(request: Request, url: URL): boolean {
    if (url.origin !== self.location.origin) {
        return false
    }
    if (!url.pathname.startsWith('/assets/')) {
        return false
    }
    if (request.destination !== 'script' && request.destination !== 'style') {
        return false
    }

    return isOptionalRuntimeCacheAssetUrl(url.pathname)
}

function resolveNotificationTargetUrl(url: string): string {
    return new URL(url, self.location.origin).href
}

function createCacheableResponsePlugin(statuses: readonly number[]): CacheableResponseRuntimePlugin {
    const allowedStatuses = new Set(statuses)

    return {
        name: 'cacheable-response-plugin',
        async cacheWillUpdate({ response }) {
            return allowedStatuses.has(response.status) ? response : null
        },
    }
}

function createExpirationPlugin(options: { maxEntries: number; maxAgeSeconds: number }): ExpirationPlugin {
    return new ExpirationPlugin(options)
}

function createNetworkFirstRuntimeCache(options: {
    cacheName: string
    maxEntries: number
    maxAgeSeconds: number
}): NetworkFirst {
    return new NetworkFirst({
        cacheName: options.cacheName,
        networkTimeoutSeconds: API_NETWORK_TIMEOUT_SECONDS,
        plugins: [
            createCacheableResponsePlugin(SAME_ORIGIN_CACHEABLE_RESPONSE_STATUSES),
            createExpirationPlugin({
                maxEntries: options.maxEntries,
                maxAgeSeconds: options.maxAgeSeconds,
            }),
        ],
    })
}

function createCacheFirstRuntimeCache(options: {
    cacheName: string
    maxEntries: number
    maxAgeSeconds: number
    statuses: readonly number[]
}): CacheFirst {
    return new CacheFirst({
        cacheName: options.cacheName,
        plugins: [
            createCacheableResponsePlugin(options.statuses),
            createExpirationPlugin({
                maxEntries: options.maxEntries,
                maxAgeSeconds: options.maxAgeSeconds,
            }),
        ],
    })
}

async function focusExistingClient(url: string): Promise<boolean> {
    const targetUrl = resolveNotificationTargetUrl(url)
    const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
    })
    const targetClient = clients.find((client) => client.url === targetUrl)

    if (targetClient && 'focus' in targetClient) {
        await targetClient.focus()
        return true
    }

    const sameOriginClient = clients.find((client) => client.url.startsWith(self.location.origin))
    if (!sameOriginClient) {
        return false
    }

    if ('navigate' in sameOriginClient) {
        await sameOriginClient.navigate(targetUrl)
    }
    if ('focus' in sameOriginClient) {
        await sameOriginClient.focus()
    }
    return true
}

self.skipWaiting()
cleanupOutdatedCaches()

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim())
})

precacheAndRoute(buildAppShellPrecacheManifest(self.__WB_MANIFEST))

registerRoute(
    ({ url }) => url.pathname === '/api/sessions',
    createNetworkFirstRuntimeCache({
        cacheName: API_SESSIONS_CACHE_NAME,
        maxEntries: API_SESSIONS_MAX_ENTRIES,
        maxAgeSeconds: API_SESSIONS_MAX_AGE_SECONDS,
    })
)

registerRoute(
    ({ url }) => /^\/api\/sessions\/[^/]+$/.test(url.pathname),
    createNetworkFirstRuntimeCache({
        cacheName: API_SESSION_DETAIL_CACHE_NAME,
        maxEntries: API_SESSION_DETAIL_MAX_ENTRIES,
        maxAgeSeconds: API_SESSION_DETAIL_MAX_AGE_SECONDS,
    })
)

registerRoute(
    ({ url }) => url.pathname === '/api/runtime',
    createNetworkFirstRuntimeCache({
        cacheName: API_RUNTIME_CACHE_NAME,
        maxEntries: API_RUNTIME_MAX_ENTRIES,
        maxAgeSeconds: API_RUNTIME_MAX_AGE_SECONDS,
    })
)

registerRoute(
    /^https:\/\/cdn\.socket\.io\/.*/,
    createCacheFirstRuntimeCache({
        cacheName: CDN_SOCKET_IO_CACHE_NAME,
        maxEntries: CDN_SOCKET_IO_MAX_ENTRIES,
        maxAgeSeconds: CDN_SOCKET_IO_MAX_AGE_SECONDS,
        statuses: CROSS_ORIGIN_CACHEABLE_RESPONSE_STATUSES,
    })
)

registerRoute(
    ({ request, url }) => isRuntimeCacheableOptionalAssetRequest(request, url),
    createCacheFirstRuntimeCache({
        cacheName: OPTIONAL_ASSET_CACHE_NAME,
        maxEntries: OPTIONAL_ASSET_MAX_ENTRIES,
        maxAgeSeconds: OPTIONAL_ASSET_MAX_AGE_SECONDS,
        statuses: SAME_ORIGIN_CACHEABLE_RESPONSE_STATUSES,
    })
)

self.addEventListener('push', (event) => {
    const payload = event.data?.json() as PushPayload | undefined
    if (!payload) {
        return
    }

    const title = payload.title || 'Viby'
    const body = payload.body ?? ''
    const icon = payload.icon ?? '/pwa-192x192.png'
    const badge = payload.badge ?? '/pwa-64x64.png'
    const data = payload.data
    const tag = payload.tag

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon,
            badge,
            data,
            tag,
        })
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const data = event.notification.data as { url?: string } | undefined
    const url = data?.url ?? '/'
    event.waitUntil(
        (async () => {
            const focused = await focusExistingClient(url)
            if (!focused) {
                await self.clients.openWindow(url)
            }
        })()
    )
})
