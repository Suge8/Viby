import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { shouldRegisterServiceWorkerForOrigin } from '@/lib/runtimeAssetPolicy'
import { publishRuntimeUpdateReady } from '@/lib/runtimeUpdateChannel'

const APP_BUILD_ID_STORAGE_KEY = 'viby-app-build-id'
const RUNTIME_ASSET_RECOVERY_KEY = 'viby-runtime-asset-recovery'
const LOCAL_SERVICE_WORKER_RESET_KEY = 'viby-local-service-worker-reset'

// 一个 tab 会话内最多标记一次恢复，干净防死循环。React mount 后
// clearRuntimeAssetRecoveryMarker 会清除标记，后续错误可再次触发。
function markRuntimeAssetRecovery(reason: string): boolean {
    if (typeof window === 'undefined') {
        return true
    }

    if (readBrowserStorageItem('session', RUNTIME_ASSET_RECOVERY_KEY)) {
        return false
    }

    writeBrowserStorageItem('session', RUNTIME_ASSET_RECOVERY_KEY, reason)
    return true
}

export function clearRuntimeAssetRecoveryMarker(): void {
    if (typeof window === 'undefined') {
        return
    }

    removeBrowserStorageItem('session', RUNTIME_ASSET_RECOVERY_KEY)
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

export async function disableServiceWorkerForCurrentOrigin(
    options: { clearCaches?: boolean; keepServiceWorker?: boolean } = {}
): Promise<boolean> {
    if (typeof window === 'undefined') {
        return false
    }

    const keepServiceWorker = options.keepServiceWorker ?? shouldRegisterServiceWorkerForOrigin(window.location.origin)
    if (keepServiceWorker) {
        return false
    }

    const hasController =
        typeof navigator !== 'undefined' && 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller)
    const hasResetMarker = readBrowserStorageItem('session', LOCAL_SERVICE_WORKER_RESET_KEY) === 'done'

    await unregisterServiceWorkers()
    if (options.clearCaches !== false) await deleteRuntimeCaches()
    writeBrowserStorageItem('session', LOCAL_SERVICE_WORKER_RESET_KEY, 'done')

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

function isSameVersionLegacyBuildId(previousBuildId: string, buildId: string): boolean {
    return previousBuildId.startsWith(`${buildId}-`)
}

export function publishRuntimeUpdateForBuild(buildId: string): boolean {
    if (typeof window === 'undefined') {
        return false
    }

    const previousBuildId = readBrowserStorageItem('local', APP_BUILD_ID_STORAGE_KEY)
    writeBrowserStorageItem('local', APP_BUILD_ID_STORAGE_KEY, buildId)

    if (!previousBuildId || previousBuildId === buildId || isSameVersionLegacyBuildId(previousBuildId, buildId)) {
        return false
    }

    publishRuntimeUpdateReady(async () => {
        window.location.reload()
    })
    return true
}
