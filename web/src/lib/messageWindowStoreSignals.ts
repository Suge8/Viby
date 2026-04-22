type MessageWindowListeners = Map<string, Set<() => void>>

const NOTIFY_THROTTLE_MS = 150
const MESSAGE_WINDOW_STATE_EVICTION_DELAY_MS = 60_000

export function createMessageWindowNotifier(listeners: MessageWindowListeners): {
    notify: (sessionId: string) => void
    notifyImmediate: (sessionId: string) => void
} {
    const pendingNotifySessionIds = new Set<string>()
    let notifyRafId: ReturnType<typeof requestAnimationFrame> | null = null
    let lastNotifyAt = 0

    const flushNotifications = (): void => {
        notifyRafId = null
        lastNotifyAt = Date.now()
        const sessionIds = Array.from(pendingNotifySessionIds)
        pendingNotifySessionIds.clear()
        for (const sessionId of sessionIds) {
            const subs = listeners.get(sessionId)
            if (!subs) {
                continue
            }
            for (const listener of subs) {
                listener()
            }
        }
    }

    return {
        notify(sessionId: string): void {
            pendingNotifySessionIds.add(sessionId)
            if (notifyRafId !== null) {
                return
            }

            const elapsed = Date.now() - lastNotifyAt
            if (elapsed >= NOTIFY_THROTTLE_MS) {
                notifyRafId = requestAnimationFrame(flushNotifications)
                return
            }

            const remaining = NOTIFY_THROTTLE_MS - elapsed
            setTimeout(() => {
                notifyRafId = requestAnimationFrame(flushNotifications)
            }, remaining)
            notifyRafId = -1 as unknown as ReturnType<typeof requestAnimationFrame>
        },
        notifyImmediate(sessionId: string): void {
            const subs = listeners.get(sessionId)
            if (!subs) {
                return
            }

            for (const listener of subs) {
                listener()
            }
        },
    }
}

export function createMessageWindowStateEvictor(
    listeners: MessageWindowListeners,
    evict: (sessionId: string) => void
): {
    clear: (sessionId: string) => void
    schedule: (sessionId: string) => void
} {
    const stateEvictionTimers = new Map<string, ReturnType<typeof setTimeout>>()

    return {
        clear(sessionId: string): void {
            const timerId = stateEvictionTimers.get(sessionId)
            if (!timerId) {
                return
            }

            clearTimeout(timerId)
            stateEvictionTimers.delete(sessionId)
        },
        schedule(sessionId: string): void {
            const timerId = stateEvictionTimers.get(sessionId)
            if (timerId) {
                clearTimeout(timerId)
                stateEvictionTimers.delete(sessionId)
            }

            stateEvictionTimers.set(
                sessionId,
                setTimeout(() => {
                    stateEvictionTimers.delete(sessionId)
                    if ((listeners.get(sessionId)?.size ?? 0) > 0) {
                        return
                    }

                    evict(sessionId)
                }, MESSAGE_WINDOW_STATE_EVICTION_DELAY_MS)
            )
        },
    }
}
