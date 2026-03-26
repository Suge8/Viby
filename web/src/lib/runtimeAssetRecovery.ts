import { recordPendingAppRecovery } from '@/lib/appRecovery'
import { shouldRegisterServiceWorkerForOrigin } from '@/lib/runtimeAssetPolicy'

const APP_BUILD_ID_STORAGE_KEY = 'viby-app-build-id'
const RUNTIME_ASSET_RECOVERY_KEY = 'viby-runtime-asset-recovery'
const LOCAL_SERVICE_WORKER_RESET_KEY = 'viby-local-service-worker-reset'

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
