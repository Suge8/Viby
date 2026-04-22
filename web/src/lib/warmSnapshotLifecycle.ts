import { subscribeBrowserLifecycle } from '@/lib/browserLifecycle'

const lifecycleFlushCallbacks = new Set<() => void>()
let unsubscribeBrowserLifecycle: (() => void) | null = null

function flushAllWarmSnapshots(): void {
    for (const callback of lifecycleFlushCallbacks) {
        callback()
    }
}

function installWarmSnapshotLifecycleListeners(): void {
    if (unsubscribeBrowserLifecycle) {
        return
    }

    unsubscribeBrowserLifecycle = subscribeBrowserLifecycle((event) => {
        if (event.kind === 'visibility-hidden' || event.kind === 'pagehide' || event.kind === 'freeze') {
            flushAllWarmSnapshots()
        }
    })
}

export function registerWarmSnapshotLifecycleFlush(callback: () => void): void {
    lifecycleFlushCallbacks.add(callback)
    installWarmSnapshotLifecycleListeners()
}

export function resetWarmSnapshotLifecycleForTests(): void {
    lifecycleFlushCallbacks.clear()
    if (unsubscribeBrowserLifecycle) {
        unsubscribeBrowserLifecycle()
        unsubscribeBrowserLifecycle = null
    }
}
