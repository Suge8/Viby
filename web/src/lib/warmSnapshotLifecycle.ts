const lifecycleFlushCallbacks = new Set<() => void>()
let lifecycleListenersInstalled = false

function flushAllWarmSnapshots(): void {
    for (const callback of lifecycleFlushCallbacks) {
        callback()
    }
}

function installWarmSnapshotLifecycleListeners(): void {
    if (
        lifecycleListenersInstalled
        || typeof window === 'undefined'
        || typeof document === 'undefined'
    ) {
        return
    }

    const handleLifecycleFlush = () => {
        flushAllWarmSnapshots()
    }
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            flushAllWarmSnapshots()
        }
    }

    window.addEventListener('pagehide', handleLifecycleFlush)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('freeze', handleLifecycleFlush as EventListener)
    lifecycleListenersInstalled = true
}

export function registerWarmSnapshotLifecycleFlush(callback: () => void): void {
    lifecycleFlushCallbacks.add(callback)
    installWarmSnapshotLifecycleListeners()
}
