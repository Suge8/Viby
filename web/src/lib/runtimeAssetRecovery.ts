import { recordPendingAppRecovery } from '@/lib/appRecovery'

const APP_BUILD_ID_STORAGE_KEY = 'viby-app-build-id'
const RUNTIME_ASSET_RECOVERY_KEY = 'viby-runtime-asset-recovery'
const LOCAL_SERVICE_WORKER_RESET_KEY = 'viby-local-service-worker-reset'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])
const PRIVATE_IPV6_PREFIXES = ['fc', 'fd', 'fe8', 'fe9', 'fea', 'feb'] as const

const ASSET_FAILURE_MESSAGES = [
    'failed to fetch dynamically imported module',
    'importing a module script failed',
    'loading module from',
    'dynamically imported module'
] as const

export type RuntimeAssetFailure = {
    name?: string | null
    filename?: string | null
    message?: string | null
    stack?: string | null
}

type RuntimeAssetRecoveryReason = Extract<
    Parameters<typeof recordPendingAppRecovery>[0],
    'vite-preload-error' | 'runtime-asset-reload'
>

type RecordRuntimeAssetFailureRecoveryOptions = {
    reason: RuntimeAssetRecoveryReason
    failure: RuntimeAssetFailure
    resumeHref?: string
}

function normalizeHostname(hostname: string): string {
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return hostname.slice(1, -1)
    }
    return hostname
}

function parseOrigin(origin: string): URL | null {
    try {
        return new URL(origin)
    } catch {
        return null
    }
}

function normalizeErrorText(value: string | null | undefined): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function containsAssetPath(value: string): boolean {
    return value.includes('/assets/')
}

function hasKnownAssetLoadFailureText(values: readonly string[]): boolean {
    return values.some((value) => ASSET_FAILURE_MESSAGES.some((pattern) => value.includes(pattern)))
}

export function isLikelyRuntimeAssetFailure(failure: RuntimeAssetFailure): boolean {
    const name = normalizeErrorText(failure.name)
    const filename = normalizeErrorText(failure.filename)
    const message = normalizeErrorText(failure.message)
    const stack = normalizeErrorText(failure.stack)

    if (name === 'chunkloaderror' || name === 'vitepreloaderror') {
        return true
    }

    if (hasKnownAssetLoadFailureText([message, stack])) {
        return true
    }

    return containsAssetPath(filename) && hasKnownAssetLoadFailureText([message])
}

export function recordRuntimeAssetFailureRecovery(
    options: RecordRuntimeAssetFailureRecoveryOptions
): boolean {
    if (!isLikelyRuntimeAssetFailure(options.failure)) {
        return false
    }

    recordPendingAppRecovery(options.reason, {
        resumeHref: options.resumeHref
    })
    return true
}

function markRuntimeAssetRecovery(reason: string): boolean {
    if (typeof window === 'undefined') {
        return true
    }

    const existing = window.sessionStorage.getItem(RUNTIME_ASSET_RECOVERY_KEY)
    if (existing === reason) {
        return false
    }

    window.sessionStorage.setItem(RUNTIME_ASSET_RECOVERY_KEY, reason)
    return true
}

export function clearRuntimeAssetRecoveryMarker(): void {
    if (typeof window === 'undefined') {
        return
    }

    window.sessionStorage.removeItem(RUNTIME_ASSET_RECOVERY_KEY)
}

export function isLoopbackOrigin(origin: string): boolean {
    const parsed = parseOrigin(origin)
    if (!parsed) {
        return false
    }

    return LOOPBACK_HOSTS.has(normalizeHostname(parsed.hostname))
}

function isPrivateIpv4Hostname(hostname: string): boolean {
    const parts = hostname.split('.').map((part) => Number.parseInt(part, 10))
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
        return false
    }

    const [a, b] = parts
    return a === 10
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168)
        || (a === 169 && b === 254)
        || (a === 100 && b >= 64 && b <= 127)
}

function isPrivateIpv6Hostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase()
    return PRIVATE_IPV6_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

export function isLocalNetworkOrigin(origin: string): boolean {
    const parsed = parseOrigin(origin)
    if (!parsed) {
        return false
    }

    const hostname = normalizeHostname(parsed.hostname)
    if (LOOPBACK_HOSTS.has(hostname) || hostname.endsWith('.local')) {
        return true
    }

    return isPrivateIpv4Hostname(hostname) || isPrivateIpv6Hostname(hostname)
}

export function shouldRegisterServiceWorkerForOrigin(origin: string): boolean {
    const parsed = parseOrigin(origin)
    if (!parsed || parsed.protocol !== 'https:') {
        return false
    }

    return !isLocalNetworkOrigin(origin)
}

async function unregisterServiceWorkers(): Promise<void> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        return
    }

    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
}

async function deleteRuntimeCaches(): Promise<void> {
    if (typeof caches === 'undefined') {
        return
    }

    const cacheKeys = await caches.keys()
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)))
}

export async function resetRuntimeAssets(): Promise<void> {
    await unregisterServiceWorkers()
    await deleteRuntimeCaches()
}

export async function disableServiceWorkerForCurrentOrigin(): Promise<boolean> {
    if (typeof window === 'undefined') {
        return false
    }

    if (shouldRegisterServiceWorkerForOrigin(window.location.origin)) {
        return false
    }

    const hasController = typeof navigator !== 'undefined'
        && 'serviceWorker' in navigator
        && Boolean(navigator.serviceWorker.controller)
    const hasResetMarker = window.sessionStorage.getItem(LOCAL_SERVICE_WORKER_RESET_KEY) === 'done'

    await resetRuntimeAssets()
    window.sessionStorage.setItem(LOCAL_SERVICE_WORKER_RESET_KEY, 'done')

    return hasController && !hasResetMarker
}

export async function recoverRuntimeAssets(reason: string): Promise<boolean> {
    const shouldRecover = markRuntimeAssetRecovery(reason)
    if (!shouldRecover) {
        return false
    }

    await resetRuntimeAssets()
    return true
}

export async function invalidateRuntimeAssetsForBuild(buildId: string): Promise<boolean> {
    if (typeof window === 'undefined') {
        return false
    }

    const previousBuildId = window.localStorage.getItem(APP_BUILD_ID_STORAGE_KEY)
    window.localStorage.setItem(APP_BUILD_ID_STORAGE_KEY, buildId)

    if (!previousBuildId || previousBuildId === buildId) {
        return false
    }

    const recovered = await recoverRuntimeAssets(`build:${previousBuildId}->${buildId}`)
    if (recovered) {
        recordPendingAppRecovery('build-assets-reset')
    }
    return recovered
}
