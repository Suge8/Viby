import { registerWarmSnapshotLifecycleFlush } from '@/lib/warmSnapshotLifecycle'

type TimeoutHandle = ReturnType<typeof setTimeout>

export type WarmSnapshotWriteScheduler<Key extends string> = {
    cancel: (key: Key) => void
    flushAll: () => void
    reset: () => void
    schedule: (key: Key) => void
}

export function createWarmSnapshotWriteScheduler<Key extends string>(options: {
    debounceMs: number
    flush: (key: Key) => void
}): WarmSnapshotWriteScheduler<Key> {
    const timeouts = new Map<Key, TimeoutHandle>()
    let lifecycleRegistered = false

    function cancel(key: Key): void {
        const timeoutId = timeouts.get(key)
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
        timeouts.delete(key)
    }

    function flushKey(key: Key): void {
        cancel(key)
        options.flush(key)
    }

    function flushAll(): void {
        for (const key of [...timeouts.keys()]) {
            flushKey(key)
        }
    }

    function ensureLifecycleRegistration(): void {
        if (lifecycleRegistered) {
            return
        }

        registerWarmSnapshotLifecycleFlush(flushAll)
        lifecycleRegistered = true
    }

    function schedule(key: Key): void {
        ensureLifecycleRegistration()
        cancel(key)
        timeouts.set(
            key,
            setTimeout(() => {
                flushKey(key)
            }, options.debounceMs)
        )
    }

    function reset(): void {
        for (const timeoutId of timeouts.values()) {
            clearTimeout(timeoutId)
        }
        timeouts.clear()
        lifecycleRegistered = false
    }

    return {
        cancel,
        flushAll,
        reset,
        schedule,
    }
}
